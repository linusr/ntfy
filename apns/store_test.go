package apns_test

import (
	"fmt"
	"net/netip"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"heckel.io/ntfy/v2/apns"
	dbtest "heckel.io/ntfy/v2/db/test"
)

var testToken = strings.Repeat("ab", 32)

func forEachBackend(t *testing.T, f func(t *testing.T, store *apns.Store)) {
	t.Run("sqlite", func(t *testing.T) {
		store, err := apns.NewSQLiteStore(filepath.Join(t.TempDir(), "apns.db"), "")
		require.Nil(t, err)
		t.Cleanup(func() { store.Close() })
		f(t, store)
	})
	t.Run("postgres", func(t *testing.T) {
		testDB := dbtest.CreateTestPostgres(t)
		store, err := apns.NewPostgresStore(testDB)
		require.Nil(t, err)
		f(t, store)
	})
}

func TestStoreUpsertDeviceDevicesForTopic(t *testing.T) {
	forEachBackend(t, func(t *testing.T, store *apns.Store) {
		require.Nil(t, store.UpsertDevice(testToken, apns.EnvironmentSandbox, "u_1234", netip.MustParseAddr("1.2.3.4"), []string{"topic1", "topic2"}))

		devices, err := store.DevicesForTopic("topic1")
		require.Nil(t, err)
		require.Len(t, devices, 1)
		require.Equal(t, testToken, devices[0].Token)
		require.Equal(t, apns.EnvironmentSandbox, devices[0].Environment)
		require.Equal(t, "u_1234", devices[0].UserID)
		require.True(t, strings.HasPrefix(devices[0].ID, "apd_"))

		devices2, err := store.DevicesForTopic("topic2")
		require.Nil(t, err)
		require.Len(t, devices2, 1)
		require.Equal(t, devices[0].ID, devices2[0].ID)

		none, err := store.DevicesForTopic("topic3")
		require.Nil(t, err)
		require.Empty(t, none)
	})
}

func TestStoreUpsertDeviceReplacesTopicsAndFields(t *testing.T) {
	forEachBackend(t, func(t *testing.T, store *apns.Store) {
		require.Nil(t, store.UpsertDevice(testToken, apns.EnvironmentSandbox, "u_1234", netip.MustParseAddr("1.2.3.4"), []string{"topic1", "topic2"}))
		require.Nil(t, store.UpsertDevice(testToken, apns.EnvironmentProduction, "u_5678", netip.MustParseAddr("1.2.3.4"), []string{"topic2"}))

		devices, err := store.DevicesForTopic("topic1")
		require.Nil(t, err)
		require.Empty(t, devices)

		devices, err = store.DevicesForTopic("topic2")
		require.Nil(t, err)
		require.Len(t, devices, 1)
		require.Equal(t, apns.EnvironmentProduction, devices[0].Environment)
		require.Equal(t, "u_5678", devices[0].UserID)
	})
}

func TestStoreUpsertDeviceSubscriberIPLimitReached(t *testing.T) {
	forEachBackend(t, func(t *testing.T, store *apns.Store) {
		for i := 0; i < 10; i++ {
			token := fmt.Sprintf("%s%02d", testToken, i)
			require.Nil(t, store.UpsertDevice(token, apns.EnvironmentProduction, "", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		}
		require.Nil(t, store.UpsertDevice(testToken+"00", apns.EnvironmentProduction, "", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Equal(t, apns.ErrAPNSTooManyDevices, store.UpsertDevice(testToken+"99", apns.EnvironmentProduction, "", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Nil(t, store.UpsertDevice(testToken+"99", apns.EnvironmentProduction, "", netip.MustParseAddr("9.9.9.9"), []string{"topic1"}))
	})
}

func TestStoreRemoveDeviceByToken(t *testing.T) {
	forEachBackend(t, func(t *testing.T, store *apns.Store) {
		require.Nil(t, store.UpsertDevice(testToken, apns.EnvironmentProduction, "", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Nil(t, store.RemoveDeviceByToken(testToken))
		devices, err := store.DevicesForTopic("topic1")
		require.Nil(t, err)
		require.Empty(t, devices)
	})
}

func TestStoreRemoveDevicesByUserID(t *testing.T) {
	forEachBackend(t, func(t *testing.T, store *apns.Store) {
		require.Nil(t, store.UpsertDevice(testToken+"01", apns.EnvironmentProduction, "u_1234", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Nil(t, store.UpsertDevice(testToken+"02", apns.EnvironmentProduction, "u_5678", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Nil(t, store.RemoveDevicesByUserID("u_1234"))
		devices, err := store.DevicesForTopic("topic1")
		require.Nil(t, err)
		require.Len(t, devices, 1)
		require.Equal(t, "u_5678", devices[0].UserID)
		require.Equal(t, apns.ErrAPNSUserIDCannotBeEmpty, store.RemoveDevicesByUserID(""))
	})
}

func TestStoreRemoveExpiredDevices(t *testing.T) {
	forEachBackend(t, func(t *testing.T, store *apns.Store) {
		require.Nil(t, store.UpsertDevice(testToken+"01", apns.EnvironmentProduction, "", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Nil(t, store.UpsertDevice(testToken+"02", apns.EnvironmentProduction, "", netip.MustParseAddr("1.2.3.4"), []string{"topic1"}))
		require.Nil(t, store.SetDeviceUpdatedAt(testToken+"01", time.Now().Add(-61*24*time.Hour).Unix()))

		require.Nil(t, store.RemoveExpiredDevices(60*24*time.Hour))
		devices, err := store.DevicesForTopic("topic1")
		require.Nil(t, err)
		require.Len(t, devices, 1)
		require.Equal(t, testToken+"02", devices[0].Token)
	})
}
