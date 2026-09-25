package apns

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	productionURL = "https://api.push.apple.com"
	sandboxURL    = "https://api.sandbox.push.apple.com"

	// Apple rejects provider tokens older than one hour and throttles refreshes more frequent than
	// every 20 minutes (TooManyProviderTokenUpdates)
	providerTokenRefreshInterval = 50 * time.Minute

	requestTimeout = 30 * time.Second
)

// Push types, see https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
const (
	PushTypeAlert      = "alert"
	PushTypeBackground = "background"
)

// Priorities for the apns-priority header. Background pushes must use PriorityPowerConsiderate.
const (
	PriorityImmediate        = 10
	PriorityPowerConsiderate = 5
)

// Notification is a single push request to one device.
type Notification struct {
	Token       string
	Environment string
	PushType    string
	Priority    int
	CollapseID  string
	Expiration  time.Time // Zero means APNs attempts delivery once and does not store the notification
	Payload     []byte
}

// Error is a non-2xx response from APNs.
type Error struct {
	StatusCode int
	Reason     string
}

func (e *Error) Error() string {
	return fmt.Sprintf("apns: HTTP %d %s", e.StatusCode, e.Reason)
}

// Unregistered reports whether the device token is permanently invalid and should be forgotten.
func (e *Error) Unregistered() bool {
	switch e.Reason {
	case "Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic", "ExpiredToken":
		return true
	}
	return e.StatusCode == http.StatusGone
}

// Client sends notifications to APNs over HTTP/2 using token-based (.p8) authentication.
type Client struct {
	key           *ecdsa.PrivateKey
	keyID         string
	teamID        string
	bundleID      string
	httpClient    *http.Client
	productionURL string
	sandboxURL    string

	mu              sync.Mutex
	providerToken   string
	providerTokenAt time.Time
}

// Option customizes a Client.
type Option func(c *Client)

// WithEndpoints overrides the APNs gateway URLs and HTTP client, e.g. to point at a test server.
func WithEndpoints(production, sandbox string, httpClient *http.Client) Option {
	return func(c *Client) {
		c.productionURL = production
		c.sandboxURL = sandbox
		c.httpClient = httpClient
	}
}

// NewClientFromKeyFile creates a client from an APNs auth key (.p8) file downloaded from the Apple
// Developer portal.
func NewClientFromKeyFile(keyFile, keyID, teamID, bundleID string, options ...Option) (*Client, error) {
	b, err := os.ReadFile(keyFile)
	if err != nil {
		return nil, err
	}
	key, err := ParsePrivateKey(b)
	if err != nil {
		return nil, err
	}
	return NewClient(key, keyID, teamID, bundleID, options...), nil
}

// NewClient creates a client from a parsed APNs auth key.
func NewClient(key *ecdsa.PrivateKey, keyID, teamID, bundleID string, options ...Option) *Client {
	c := &Client{
		key:           key,
		keyID:         keyID,
		teamID:        teamID,
		bundleID:      bundleID,
		httpClient:    &http.Client{Timeout: requestTimeout, Transport: &http.Transport{ForceAttemptHTTP2: true}},
		productionURL: productionURL,
		sandboxURL:    sandboxURL,
	}
	for _, option := range options {
		option(c)
	}
	return c
}

// ParsePrivateKey parses a PEM-encoded PKCS#8 ECDSA key, the format of APNs .p8 files.
func ParsePrivateKey(b []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode(b)
	if block == nil {
		return nil, errors.New("apns: key is not PEM-encoded")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("apns: cannot parse key: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("apns: key is not an ECDSA key")
	}
	return key, nil
}

// Send delivers a notification. A rejected provider token is refreshed and the request retried once.
func (c *Client) Send(ctx context.Context, n *Notification) error {
	err := c.send(ctx, n)
	var apnsErr *Error
	if errors.As(err, &apnsErr) && apnsErr.Reason == "ExpiredProviderToken" {
		c.invalidateProviderToken()
		return c.send(ctx, n)
	}
	return err
}

func (c *Client) send(ctx context.Context, n *Notification) error {
	token, err := c.bearerToken()
	if err != nil {
		return err
	}
	baseURL := c.productionURL
	if n.Environment == EnvironmentSandbox {
		baseURL = c.sandboxURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/3/device/"+n.Token, bytes.NewReader(n.Payload))
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "bearer "+token)
	req.Header.Set("apns-topic", c.bundleID)
	req.Header.Set("apns-push-type", n.PushType)
	req.Header.Set("apns-priority", strconv.Itoa(n.Priority))
	req.Header.Set("apns-expiration", strconv.FormatInt(expirationUnix(n.Expiration), 10))
	if n.CollapseID != "" {
		req.Header.Set("apns-collapse-id", n.CollapseID)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&body)
	return &Error{StatusCode: resp.StatusCode, Reason: body.Reason}
}

func (c *Client) bearerToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.providerToken != "" && time.Since(c.providerTokenAt) < providerTokenRefreshInterval {
		return c.providerToken, nil
	}
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": c.teamID,
		"iat": now.Unix(),
	})
	t.Header["kid"] = c.keyID
	signed, err := t.SignedString(c.key)
	if err != nil {
		return "", err
	}
	c.providerToken, c.providerTokenAt = signed, now
	return signed, nil
}

func (c *Client) invalidateProviderToken() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.providerToken = ""
}

func expirationUnix(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.Unix()
}
