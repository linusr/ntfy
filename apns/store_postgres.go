package apns

import (
	"heckel.io/ntfy/v2/db"
	"heckel.io/ntfy/v2/db/schema"
)

const (
	postgresSelectDeviceIDByTokenQuery           = `SELECT id FROM apns_device WHERE token = $1`
	postgresSelectDeviceCountBySubscriberIPQuery = `SELECT COUNT(*) FROM apns_device WHERE subscriber_ip = $1`
	postgresSelectDevicesForTopicQuery           = `
		SELECT d.id, d.token, d.environment, d.user_id
		FROM apns_device_topic dt
		JOIN apns_device d ON d.id = dt.device_id
		WHERE dt.topic = $1
		ORDER BY d.token
	`
	postgresUpsertDeviceQuery = `
		INSERT INTO apns_device (id, token, environment, user_id, subscriber_ip, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (token)
		DO UPDATE SET environment = excluded.environment, user_id = excluded.user_id, subscriber_ip = excluded.subscriber_ip, updated_at = excluded.updated_at
		RETURNING id
	`
	postgresUpdateDeviceUpdatedAtQuery = `UPDATE apns_device SET updated_at = $1 WHERE token = $2`
	postgresDeleteDeviceByTokenQuery   = `DELETE FROM apns_device WHERE token = $1`
	postgresDeleteDeviceByUserIDQuery  = `DELETE FROM apns_device WHERE user_id = $1`
	postgresDeleteDeviceByAgeQuery     = `DELETE FROM apns_device WHERE updated_at <= $1`

	postgresInsertDeviceTopicQuery              = `INSERT INTO apns_device_topic (device_id, topic) VALUES ($1, $2)`
	postgresDeleteDeviceTopicAllQuery           = `DELETE FROM apns_device_topic WHERE device_id = $1`
	postgresDeleteDeviceTopicWithoutDeviceQuery = `DELETE FROM apns_device_topic WHERE device_id NOT IN (SELECT id FROM apns_device)`
)

const (
	postgresCurrentSchemaVersion = 1
)

var (
	postgresCreateTables = schema.AsMigrateFunc(`
		CREATE TABLE IF NOT EXISTS apns_device (
			id TEXT PRIMARY KEY,
			token TEXT NOT NULL UNIQUE,
			environment TEXT NOT NULL,
			user_id TEXT NOT NULL,
			subscriber_ip TEXT NOT NULL,
			updated_at BIGINT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_apns_subscriber_ip ON apns_device (subscriber_ip);
		CREATE INDEX IF NOT EXISTS idx_apns_updated_at ON apns_device (updated_at);
		CREATE INDEX IF NOT EXISTS idx_apns_user_id ON apns_device (user_id);
		CREATE TABLE IF NOT EXISTS apns_device_topic (
			device_id TEXT NOT NULL REFERENCES apns_device (id) ON DELETE CASCADE,
			topic TEXT NOT NULL,
			PRIMARY KEY (device_id, topic)
		);
		CREATE INDEX IF NOT EXISTS idx_apns_topic ON apns_device_topic (topic);
	`)
)

// NewPostgresStore creates a new PostgreSQL-backed APNs device store using an existing connection pool.
func NewPostgresStore(d *db.DB) (*Store, error) {
	if err := schema.Migrate(d.Primary(), schema.Postgres, schemaStore, postgresCurrentSchemaVersion, postgresCreateTables, nil); err != nil {
		return nil, err
	}
	return &Store{
		db: d,
		queries: queries{
			selectDeviceIDByToken:           postgresSelectDeviceIDByTokenQuery,
			selectDeviceCountBySubscriberIP: postgresSelectDeviceCountBySubscriberIPQuery,
			selectDevicesForTopic:           postgresSelectDevicesForTopicQuery,
			upsertDevice:                    postgresUpsertDeviceQuery,
			updateDeviceUpdatedAt:           postgresUpdateDeviceUpdatedAtQuery,
			deleteDeviceByToken:             postgresDeleteDeviceByTokenQuery,
			deleteDeviceByUserID:            postgresDeleteDeviceByUserIDQuery,
			deleteDeviceByAge:               postgresDeleteDeviceByAgeQuery,
			insertDeviceTopic:               postgresInsertDeviceTopicQuery,
			deleteDeviceTopicAll:            postgresDeleteDeviceTopicAllQuery,
			deleteDeviceTopicWithoutDevice:  postgresDeleteDeviceTopicWithoutDeviceQuery,
		},
	}, nil
}
