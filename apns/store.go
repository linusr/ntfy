package apns

import (
	"database/sql"
	"errors"
	"net/netip"
	"time"

	"heckel.io/ntfy/v2/db"
	"heckel.io/ntfy/v2/util"
)

const (
	deviceIDPrefix                  = "apd_"
	deviceIDLength                  = 10
	deviceTokenLimitPerSubscriberIP = 10

	schemaStore = "apns"
)

// Errors returned by the store
var (
	ErrAPNSTooManyDevices      = errors.New("too many devices")
	ErrAPNSUserIDCannotBeEmpty = errors.New("user ID cannot be empty")
)

// Store holds the database connection and queries for APNs device registrations.
type Store struct {
	db      *db.DB
	queries queries
}

// queries holds the database-specific SQL queries.
type queries struct {
	selectDeviceIDByToken           string
	selectDeviceCountBySubscriberIP string
	selectDevicesForTopic           string
	upsertDevice                    string
	updateDeviceUpdatedAt           string
	deleteDeviceByToken             string
	deleteDeviceByUserID            string
	deleteDeviceByAge               string
	insertDeviceTopic               string
	deleteDeviceTopicAll            string
	deleteDeviceTopicWithoutDevice  string
}

// UpsertDevice adds or updates a device registration and replaces its topic list.
func (s *Store) UpsertDevice(token, environment, userID string, subscriberIP netip.Addr, topics []string) error {
	return db.ExecTx(s.db, func(tx *sql.Tx) error {
		var deviceCount int
		if err := tx.QueryRow(s.queries.selectDeviceCountBySubscriberIP, subscriberIP.String()).Scan(&deviceCount); err != nil {
			return err
		}
		var deviceID string
		if err := tx.QueryRow(s.queries.selectDeviceIDByToken, token).Scan(&deviceID); errors.Is(err, sql.ErrNoRows) {
			if deviceCount >= deviceTokenLimitPerSubscriberIP {
				return ErrAPNSTooManyDevices
			}
			deviceID = util.RandomStringPrefix(deviceIDPrefix, deviceIDLength)
		} else if err != nil {
			return err
		}
		// RETURNING id yields the winning row's ID if a concurrent request inserted the same token first
		if err := tx.QueryRow(s.queries.upsertDevice, deviceID, token, environment, userID, subscriberIP.String(), time.Now().Unix()).Scan(&deviceID); err != nil {
			return err
		}
		if _, err := tx.Exec(s.queries.deleteDeviceTopicAll, deviceID); err != nil {
			return err
		}
		for _, topic := range topics {
			if _, err := tx.Exec(s.queries.insertDeviceTopic, deviceID, topic); err != nil {
				return err
			}
		}
		return nil
	})
}

// DevicesForTopic returns all devices subscribed to the given topic.
func (s *Store) DevicesForTopic(topic string) ([]*Device, error) {
	rows, err := s.db.ReadOnly().Query(s.queries.selectDevicesForTopic, topic)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	devices := make([]*Device, 0)
	for rows.Next() {
		var id, token, environment, userID string
		if err := rows.Scan(&id, &token, &environment, &userID); err != nil {
			return nil, err
		}
		devices = append(devices, &Device{
			ID:          id,
			Token:       token,
			Environment: environment,
			UserID:      userID,
		})
	}
	return devices, rows.Err()
}

// RemoveDeviceByToken removes the device with the given token.
func (s *Store) RemoveDeviceByToken(token string) error {
	_, err := s.db.Exec(s.queries.deleteDeviceByToken, token)
	return err
}

// RemoveDevicesByUserID removes all devices for the given user ID.
func (s *Store) RemoveDevicesByUserID(userID string) error {
	if userID == "" {
		return ErrAPNSUserIDCannotBeEmpty
	}
	_, err := s.db.Exec(s.queries.deleteDeviceByUserID, userID)
	return err
}

// RemoveExpiredDevices removes all devices that have not re-registered within the given duration.
func (s *Store) RemoveExpiredDevices(expireAfter time.Duration) error {
	return db.ExecTx(s.db, func(tx *sql.Tx) error {
		if _, err := tx.Exec(s.queries.deleteDeviceByAge, time.Now().Add(-expireAfter).Unix()); err != nil {
			return err
		}
		_, err := tx.Exec(s.queries.deleteDeviceTopicWithoutDevice)
		return err
	})
}

// SetDeviceUpdatedAt updates the updated_at timestamp for a device by token. Exported for testing.
func (s *Store) SetDeviceUpdatedAt(token string, updatedAt int64) error {
	_, err := s.db.Exec(s.queries.updateDeviceUpdatedAt, updatedAt, token)
	return err
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}
