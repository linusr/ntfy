//go:build !noapns

package server

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"heckel.io/ntfy/v2/apns"
	"heckel.io/ntfy/v2/model"
	"heckel.io/ntfy/v2/user"
	"heckel.io/ntfy/v2/util"
)

var testAPNSToken = strings.Repeat("ab", 32)

type testAPNSSender struct {
	mu            sync.Mutex
	notifications []*apns.Notification
	errFor        map[string]error
}

func (s *testAPNSSender) Send(_ context.Context, n *apns.Notification) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notifications = append(s.notifications, n)
	return s.errFor[n.Token]
}

func (s *testAPNSSender) Notifications() []*apns.Notification {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]*apns.Notification(nil), s.notifications...)
}

func newTestConfigWithAPNS(t *testing.T, databaseURL string) *Config {
	conf := newTestConfig(t, databaseURL)
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.Nil(t, err)
	der, err := x509.MarshalPKCS8PrivateKey(key)
	require.Nil(t, err)
	conf.APNSKeyFile = filepath.Join(t.TempDir(), "AuthKey.p8")
	require.Nil(t, os.WriteFile(conf.APNSKeyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0600))
	conf.APNSKeyID = "KEY1234567"
	conf.APNSTeamID = "TEAM123456"
	conf.APNSBundleID = "io.example.ntfy"
	if conf.DatabaseURL == "" {
		conf.APNSFile = filepath.Join(t.TempDir(), "apns.db")
	}
	return conf
}

func newTestServerWithAPNSSender(t *testing.T, conf *Config) (*Server, *testAPNSSender) {
	s := newTestServer(t, conf)
	sender := &testAPNSSender{errFor: make(map[string]error)}
	s.apnsSender = sender
	return s, sender
}

func apnsDevicePayload(t *testing.T, token, environment string, topics ...string) string {
	b, err := json.Marshal(&apiAPNSDeviceRequest{Token: token, Environment: environment, Topics: topics})
	require.Nil(t, err)
	return string(b)
}

func decodeAPNSPayload(t *testing.T, n *apns.Notification) *apnsPayload {
	var p apnsPayload
	require.Nil(t, json.Unmarshal(n.Payload, &p))
	return &p
}

func TestServer_APNS_Disabled(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s := newTestServer(t, newTestConfig(t, databaseURL))
		rr := request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil)
		require.Equal(t, 404, rr.Code)
	})
}

func TestServer_APNS_RegisterAndPublish(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, sender := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))

		rr := request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, strings.ToUpper(testAPNSToken), "sandbox", "mytopic"), nil)
		require.Equal(t, 200, rr.Code)

		rr = request(t, s, "PUT", "/mytopic", "Backup finished", map[string]string{
			"Title":    "nas01",
			"Priority": "high",
			"Tags":     "white_check_mark",
		})
		require.Equal(t, 200, rr.Code)
		m := toMessage(t, rr.Body.String())

		waitFor(t, func() bool { return len(sender.Notifications()) == 1 })
		n := sender.Notifications()[0]
		require.Equal(t, testAPNSToken, n.Token)
		require.Equal(t, apns.EnvironmentSandbox, n.Environment)
		require.Equal(t, apns.PushTypeAlert, n.PushType)
		require.Equal(t, apns.PriorityImmediate, n.Priority)
		require.Equal(t, m.ID, n.CollapseID)
		require.False(t, n.Expiration.IsZero())

		p := decodeAPNSPayload(t, n)
		require.Equal(t, "nas01", p.APS.Alert.Title)
		require.Equal(t, "Backup finished", p.APS.Alert.Body)
		require.Equal(t, "time-sensitive", p.APS.InterruptionLevel)
		require.Equal(t, "mytopic", p.APS.ThreadID)
		require.Equal(t, 1, p.APS.MutableContent)
		require.Equal(t, "default", p.APS.Sound)
		require.Equal(t, s.config.BaseURL, p.BaseURL)
		require.Equal(t, m.ID, p.Message.ID)
		require.Equal(t, model.MessageEvent, p.Message.Event)
		require.Equal(t, []string{"white_check_mark"}, p.Message.Tags)
	})
}

func TestServer_APNS_OnlySubscribedTopics(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, sender := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))
		require.Equal(t, 200, request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil).Code)

		require.Equal(t, 200, request(t, s, "PUT", "/othertopic", "not for us", nil).Code)
		require.Equal(t, 200, request(t, s, "PUT", "/mytopic", "for us", nil).Code)

		waitFor(t, func() bool { return len(sender.Notifications()) == 1 })
		p := decodeAPNSPayload(t, sender.Notifications()[0])
		require.Equal(t, "for us", p.APS.Alert.Body)
		require.Equal(t, "mytopic", p.APS.Alert.Title)
		require.Equal(t, apns.EnvironmentProduction, sender.Notifications()[0].Environment)
	})
}

func TestServer_APNS_Unregister(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, _ := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))
		require.Equal(t, 200, request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil).Code)
		require.Equal(t, 200, request(t, s, "DELETE", "/v1/apns", apnsDevicePayload(t, testAPNSToken, ""), nil).Code)

		devices, err := s.apnsStore.DevicesForTopic("mytopic")
		require.Nil(t, err)
		require.Empty(t, devices)
	})
}

func TestServer_APNS_InvalidRegistration(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, _ := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))

		rr := request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, "not-a-token", "", "mytopic"), nil)
		require.Equal(t, 400, rr.Code)
		require.Equal(t, 40059, toHTTPError(t, rr.Body.String()).Code)

		rr = request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "staging", "mytopic"), nil)
		require.Equal(t, 400, rr.Code)
		require.Equal(t, 40059, toHTTPError(t, rr.Body.String()).Code)

		topics := make([]string, apnsTopicSubscribeLimit+1)
		for i := range topics {
			topics[i] = fmt.Sprintf("topic%d", i)
		}
		rr = request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", topics...), nil)
		require.Equal(t, 400, rr.Code)
		require.Equal(t, 40060, toHTTPError(t, rr.Body.String()).Code)
	})
}

func TestServer_APNS_UnregisteredTokenIsRemoved(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, sender := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))
		sender.errFor[testAPNSToken] = &apns.Error{StatusCode: http.StatusGone, Reason: "Unregistered"}
		require.Equal(t, 200, request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil).Code)

		require.Equal(t, 200, request(t, s, "PUT", "/mytopic", "hi", nil).Code)
		waitFor(t, func() bool {
			devices, err := s.apnsStore.DevicesForTopic("mytopic")
			return err == nil && len(devices) == 0
		})
	})
}

func TestServer_APNS_TransientErrorKeepsDevice(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, sender := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))
		sender.errFor[testAPNSToken] = &apns.Error{StatusCode: http.StatusTooManyRequests, Reason: "TooManyRequests"}
		require.Equal(t, 200, request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil).Code)

		require.Equal(t, 200, request(t, s, "PUT", "/mytopic", "hi", nil).Code)
		waitFor(t, func() bool { return len(sender.Notifications()) == 1 })
		devices, err := s.apnsStore.DevicesForTopic("mytopic")
		require.Nil(t, err)
		require.Len(t, devices, 1)
	})
}

func TestServer_APNS_ProtectedTopic(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		conf := configureAuth(t, newTestConfigWithAPNS(t, databaseURL))
		conf.AuthDefault = user.PermissionDenyAll
		s, sender := newTestServerWithAPNSSender(t, conf)
		require.Nil(t, s.userManager.AddUser("ben", "ben", user.RoleUser, false))
		require.Nil(t, s.userManager.AllowAccess("ben", "mytopic", user.PermissionReadWrite))
		auth := map[string]string{"Authorization": util.BasicAuth("ben", "ben")}

		rr := request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil)
		require.Equal(t, 403, rr.Code)

		rr = request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), auth)
		require.Equal(t, 200, rr.Code)
		devices, err := s.apnsStore.DevicesForTopic("mytopic")
		require.Nil(t, err)
		require.Len(t, devices, 1)
		require.True(t, strings.HasPrefix(devices[0].UserID, "u_"))

		require.Equal(t, 200, request(t, s, "PUT", "/mytopic", "first", auth).Code)
		waitFor(t, func() bool { return len(sender.Notifications()) == 1 })

		// Access revoked after registration: the device must no longer receive messages
		require.Nil(t, s.userManager.ResetAccess("ben", "mytopic"))
		require.Nil(t, s.userManager.AllowAccess("ben", "mytopic", user.PermissionWrite))
		require.Equal(t, 200, request(t, s, "PUT", "/mytopic", "second", auth).Code)
		require.Equal(t, 200, request(t, s, "PUT", "/mytopic", "third", auth).Code)
		waitFor(t, func() bool {
			m, err := s.messageCache.Messages("mytopic", model.SinceAllMessages, false)
			return err == nil && len(m) == 3
		})
		require.Len(t, sender.Notifications(), 1)
	})
}

func TestServer_APNS_DeleteSendsBackgroundPush(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		s, sender := newTestServerWithAPNSSender(t, newTestConfigWithAPNS(t, databaseURL))
		require.Equal(t, 200, request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), nil).Code)

		require.Equal(t, 200, request(t, s, "PUT", "/mytopic/seq1", "hello", nil).Code)
		require.Equal(t, 200, request(t, s, "DELETE", "/mytopic/seq1", "", nil).Code)
		waitFor(t, func() bool { return len(sender.Notifications()) == 2 })

		var alert, background *apns.Notification
		for _, n := range sender.Notifications() {
			if n.PushType == apns.PushTypeBackground {
				background = n
			} else {
				alert = n
			}
		}
		require.NotNil(t, alert)
		require.NotNil(t, background)
		require.Equal(t, "seq1", alert.CollapseID)
		require.Equal(t, apns.PriorityPowerConsiderate, background.Priority)
		p := decodeAPNSPayload(t, background)
		require.Nil(t, p.APS.Alert)
		require.Equal(t, 1, p.APS.ContentAvailable)
		require.Equal(t, model.MessageDeleteEvent, p.Message.Event)
		require.Equal(t, "seq1", p.Message.SequenceID)
	})
}

func TestServer_APNS_AccountDeletionRemovesDevices(t *testing.T) {
	forEachBackend(t, func(t *testing.T, databaseURL string) {
		conf := configureAuth(t, newTestConfigWithAPNS(t, databaseURL))
		conf.EnableSignup = true
		s, _ := newTestServerWithAPNSSender(t, conf)
		require.Equal(t, 200, request(t, s, "POST", "/v1/account", `{"username":"ben", "password":"ben"}`, nil).Code)
		auth := map[string]string{"Authorization": util.BasicAuth("ben", "ben")}
		require.Equal(t, 200, request(t, s, "POST", "/v1/apns", apnsDevicePayload(t, testAPNSToken, "", "mytopic"), auth).Code)

		require.Equal(t, 200, request(t, s, "DELETE", "/v1/account", `{"password":"ben"}`, auth).Code)
		devices, err := s.apnsStore.DevicesForTopic("mytopic")
		require.Nil(t, err)
		require.Empty(t, devices)
	})
}

func TestToAPNSNotification_PriorityMapping(t *testing.T) {
	cases := []struct {
		priority int
		level    string
		sound    string
		header   int
	}{
		{0, "active", "default", apns.PriorityImmediate},
		{1, "passive", "", apns.PriorityPowerConsiderate},
		{2, "passive", "", apns.PriorityPowerConsiderate},
		{3, "active", "default", apns.PriorityImmediate},
		{4, "time-sensitive", "default", apns.PriorityImmediate},
		{5, "time-sensitive", "default", apns.PriorityImmediate},
	}
	for _, c := range cases {
		m := model.NewDefaultMessage("mytopic", "hi")
		m.Priority = c.priority
		n, err := toAPNSNotification(m, "https://ntfy.example.com", APNSPayloadFull)
		require.Nil(t, err)
		p := decodeAPNSPayload(t, n)
		require.Equal(t, c.level, p.APS.InterruptionLevel, "priority %d", c.priority)
		require.Equal(t, c.sound, p.APS.Sound, "priority %d", c.priority)
		require.Equal(t, c.header, n.Priority, "priority %d", c.priority)
	}
}

func TestToAPNSNotification_MinimalPayload(t *testing.T) {
	m := model.NewDefaultMessage("mytopic", "secret content")
	m.Title = "secret title"
	n, err := toAPNSNotification(m, "https://ntfy.example.com", APNSPayloadMinimal)
	require.Nil(t, err)
	require.NotContains(t, string(n.Payload), "secret")
	p := decodeAPNSPayload(t, n)
	require.Equal(t, "mytopic", p.APS.Alert.Title)
	require.Equal(t, apnsMinimalBody, p.APS.Alert.Body)
	require.Equal(t, model.PollRequestEvent, p.Message.Event)
	require.Equal(t, m.ID, p.Message.PollID)
}

func TestToAPNSNotification_OversizedFallsBackToPreview(t *testing.T) {
	m := model.NewDefaultMessage("mytopic", strings.Repeat("é", 3000))
	n, err := toAPNSNotification(m, "https://ntfy.example.com", APNSPayloadFull)
	require.Nil(t, err)
	require.LessOrEqual(t, len(n.Payload), apnsPayloadLimit)
	p := decodeAPNSPayload(t, n)
	require.LessOrEqual(t, len(p.APS.Alert.Body), apnsPreviewBodyLimit)
	require.True(t, strings.HasSuffix(p.APS.Alert.Body, "…"))
	require.Equal(t, model.PollRequestEvent, p.Message.Event)
	require.Equal(t, m.ID, p.Message.PollID)
}

func TestToAPNSNotification_IgnoredEvents(t *testing.T) {
	n, err := toAPNSNotification(model.NewKeepaliveMessage("mytopic"), "https://ntfy.example.com", APNSPayloadFull)
	require.Nil(t, err)
	require.Nil(t, n)
}

func TestTruncateUTF8(t *testing.T) {
	require.Equal(t, "short", truncateUTF8("short", 10))
	truncated := truncateUTF8(strings.Repeat("日", 10), 10)
	require.LessOrEqual(t, len(truncated), 10)
	require.True(t, strings.HasSuffix(truncated, "…"))
	require.Equal(t, "日日…", truncated)
}
