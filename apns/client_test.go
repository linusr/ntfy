package apns_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"heckel.io/ntfy/v2/apns"
)

type recordedRequest struct {
	Path   string
	Proto  string
	Header http.Header
	Body   string
}

// newTestGateway starts an HTTP/2 TLS server standing in for both APNs gateways; requests to the
// sandbox gateway are marked by the "sandbox" path prefix.
func newTestGateway(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) (*httptest.Server, *[]recordedRequest, *sync.Mutex) {
	var mu sync.Mutex
	requests := make([]recordedRequest, 0)
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		requests = append(requests, recordedRequest{Path: r.URL.Path, Proto: r.Proto, Header: r.Header.Clone(), Body: string(body)})
		mu.Unlock()
		handler(w, r)
	}))
	srv.EnableHTTP2 = true
	srv.StartTLS()
	t.Cleanup(srv.Close)
	return srv, &requests, &mu
}

func newTestKey(t *testing.T) *ecdsa.PrivateKey {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.Nil(t, err)
	return key
}

func newTestClient(t *testing.T, srv *httptest.Server, key *ecdsa.PrivateKey) *apns.Client {
	return apns.NewClient(key, "KEY1234567", "TEAM123456", "io.example.ntfy", apns.WithEndpoints(srv.URL, srv.URL+"/sandbox", srv.Client()))
}

func TestClientSendSuccess(t *testing.T) {
	srv, requests, mu := newTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	key := newTestKey(t)
	client := newTestClient(t, srv, key)

	err := client.Send(context.Background(), &apns.Notification{
		Token:      "abcd",
		PushType:   apns.PushTypeAlert,
		Priority:   apns.PriorityImmediate,
		CollapseID: "seq1",
		Expiration: time.Unix(1700000000, 0),
		Payload:    []byte(`{"aps":{}}`),
	})
	require.Nil(t, err)

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, *requests, 1)
	req := (*requests)[0]
	require.Equal(t, "/3/device/abcd", req.Path)
	require.Equal(t, "HTTP/2.0", req.Proto)
	require.Equal(t, "io.example.ntfy", req.Header.Get("apns-topic"))
	require.Equal(t, "alert", req.Header.Get("apns-push-type"))
	require.Equal(t, "10", req.Header.Get("apns-priority"))
	require.Equal(t, "seq1", req.Header.Get("apns-collapse-id"))
	require.Equal(t, "1700000000", req.Header.Get("apns-expiration"))
	require.Equal(t, `{"aps":{}}`, req.Body)

	tokenString := strings.TrimPrefix(req.Header.Get("authorization"), "bearer ")
	parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		return &key.PublicKey, nil
	}, jwt.WithValidMethods([]string{"ES256"}))
	require.Nil(t, err)
	require.Equal(t, "KEY1234567", parsed.Header["kid"])
	claims := parsed.Claims.(jwt.MapClaims)
	require.Equal(t, "TEAM123456", claims["iss"])
}

func TestClientSendSandboxEnvironment(t *testing.T) {
	srv, requests, mu := newTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	client := newTestClient(t, srv, newTestKey(t))
	require.Nil(t, client.Send(context.Background(), &apns.Notification{Token: "abcd", Environment: apns.EnvironmentSandbox, PushType: apns.PushTypeAlert, Priority: 10}))

	mu.Lock()
	defer mu.Unlock()
	require.Equal(t, "/sandbox/3/device/abcd", (*requests)[0].Path)
	require.Equal(t, "0", (*requests)[0].Header.Get("apns-expiration"))
	require.Empty(t, (*requests)[0].Header.Get("apns-collapse-id"))
}

func TestClientSendReusesProviderToken(t *testing.T) {
	srv, requests, mu := newTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	client := newTestClient(t, srv, newTestKey(t))
	for i := 0; i < 3; i++ {
		require.Nil(t, client.Send(context.Background(), &apns.Notification{Token: "abcd", PushType: apns.PushTypeAlert, Priority: 10}))
	}
	mu.Lock()
	defer mu.Unlock()
	require.Len(t, *requests, 3)
	require.Equal(t, (*requests)[0].Header.Get("authorization"), (*requests)[2].Header.Get("authorization"))
}

func TestClientSendUnregistered(t *testing.T) {
	srv, _, _ := newTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusGone)
		_, _ = w.Write([]byte(`{"reason":"Unregistered","timestamp":1700000000000}`))
	})
	client := newTestClient(t, srv, newTestKey(t))
	err := client.Send(context.Background(), &apns.Notification{Token: "abcd", PushType: apns.PushTypeAlert, Priority: 10})
	var apnsErr *apns.Error
	require.True(t, errors.As(err, &apnsErr))
	require.Equal(t, http.StatusGone, apnsErr.StatusCode)
	require.Equal(t, "Unregistered", apnsErr.Reason)
	require.True(t, apnsErr.Unregistered())
}

func TestClientSendTransientErrorIsNotUnregistered(t *testing.T) {
	srv, _, _ := newTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"reason":"TooManyRequests"}`))
	})
	client := newTestClient(t, srv, newTestKey(t))
	err := client.Send(context.Background(), &apns.Notification{Token: "abcd", PushType: apns.PushTypeAlert, Priority: 10})
	var apnsErr *apns.Error
	require.True(t, errors.As(err, &apnsErr))
	require.False(t, apnsErr.Unregistered())
}

func TestClientSendRetriesExpiredProviderToken(t *testing.T) {
	var mu sync.Mutex
	calls := 0
	srv, requests, reqMu := newTestGateway(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		calls++
		if calls == 1 {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"reason":"ExpiredProviderToken"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	client := newTestClient(t, srv, newTestKey(t))
	require.Nil(t, client.Send(context.Background(), &apns.Notification{Token: "abcd", PushType: apns.PushTypeAlert, Priority: 10}))
	reqMu.Lock()
	defer reqMu.Unlock()
	require.Len(t, *requests, 2)
}

func TestNewClientFromKeyFile(t *testing.T) {
	key := newTestKey(t)
	der, err := x509.MarshalPKCS8PrivateKey(key)
	require.Nil(t, err)
	keyFile := filepath.Join(t.TempDir(), "AuthKey_KEY1234567.p8")
	require.Nil(t, os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600))

	client, err := apns.NewClientFromKeyFile(keyFile, "KEY1234567", "TEAM123456", "io.example.ntfy")
	require.Nil(t, err)
	require.NotNil(t, client)

	_, err = apns.ParsePrivateKey([]byte("not a key"))
	require.Error(t, err)
}
