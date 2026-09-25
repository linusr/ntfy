package apns

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
	"heckel.io/ntfy/v2/db"
	"heckel.io/ntfy/v2/db/schema"
)

const (
	sqliteBuiltinStartupQueries = `
		PRAGMA foreign_keys = ON;
	`

	sqliteSelectDeviceIDByTokenQuery           = `SELECT id FROM device WHERE token = ?`
	sqliteSelectDeviceCountBySubscriberIPQuery = `SELECT COUNT(*) FROM device WHERE subscriber_ip = ?`
	sqliteSelectDevicesForTopicQuery           = `
		SELECT d.id, d.token, d.environment, d.user_id
		FROM device_topic dt
		JOIN device d ON d.id = dt.device_id
		WHERE dt.topic = ?
		ORDER BY d.token
	`
	sqliteUpsertDeviceQuery = `
		INSERT INTO device (id, token, environment, user_id, subscriber_ip, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (token)
		DO UPDATE SET environment = excluded.environment, user_id = excluded.user_id, subscriber_ip = excluded.subscriber_ip, updated_at = excluded.updated_at
		RETURNING id
	`
	sqliteUpdateDeviceUpdatedAtQuery = `UPDATE device SET updated_at = ? WHERE token = ?`
	sqliteDeleteDeviceByTokenQuery   = `DELETE FROM device WHERE token = ?`
	sqliteDeleteDeviceByUserIDQuery  = `DELETE FROM device WHERE user_id = ?`
	sqliteDeleteDeviceByAgeQuery     = `DELETE FROM device WHERE updated_at <= ?`

	sqliteInsertDeviceTopicQuery              = `INSERT INTO device_topic (device_id, topic) VALUES (?, ?)`
	sqliteDeleteDeviceTopicAllQuery           = `DELETE FROM device_topic WHERE device_id = ?`
	sqliteDeleteDeviceTopicWithoutDeviceQuery = `DELETE FROM device_topic WHERE device_id NOT IN (SELECT id FROM device)`
)

const (
	sqliteCurrentSchemaVersion = 1
)

var (
	sqliteCreateTables = schema.AsMigrateFunc(`
		CREATE TABLE IF NOT EXISTS device (
			id TEXT PRIMARY KEY,
			token TEXT NOT NULL,
			environment TEXT NOT NULL,
			user_id TEXT NOT NULL,
			subscriber_ip TEXT NOT NULL,
			updated_at INT NOT NULL
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_token ON device (token);
		CREATE INDEX IF NOT EXISTS idx_subscriber_ip ON device (subscriber_ip);
		CREATE INDEX IF NOT EXISTS idx_updated_at ON device (updated_at);
		CREATE INDEX IF NOT EXISTS idx_user_id ON device (user_id);
		CREATE TABLE IF NOT EXISTS device_topic (
			device_id TEXT NOT NULL,
			topic TEXT NOT NULL,
			PRIMARY KEY (device_id, topic),
			FOREIGN KEY (device_id) REFERENCES device (id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS idx_topic ON device_topic (topic);
	`)
)

// NewSQLiteStore creates a new SQLite-backed APNs device store.
func NewSQLiteStore(filename, startupQueries string) (*Store, error) {
	d, err := sql.Open("sqlite3", filename)
	if err != nil {
		return nil, err
	}
	if err := schema.Migrate(d, schema.SQLite, schemaStore, sqliteCurrentSchemaVersion, sqliteCreateTables, nil); err != nil {
		return nil, err
	}
	if err := runSQLiteStartupQueries(d, startupQueries); err != nil {
		return nil, err
	}
	return &Store{
		db: db.New(&db.Host{DB: d}, nil),
		queries: queries{
			selectDeviceIDByToken:           sqliteSelectDeviceIDByTokenQuery,
			selectDeviceCountBySubscriberIP: sqliteSelectDeviceCountBySubscriberIPQuery,
			selectDevicesForTopic:           sqliteSelectDevicesForTopicQuery,
			upsertDevice:                    sqliteUpsertDeviceQuery,
			updateDeviceUpdatedAt:           sqliteUpdateDeviceUpdatedAtQuery,
			deleteDeviceByToken:             sqliteDeleteDeviceByTokenQuery,
			deleteDeviceByUserID:            sqliteDeleteDeviceByUserIDQuery,
			deleteDeviceByAge:               sqliteDeleteDeviceByAgeQuery,
			insertDeviceTopic:               sqliteInsertDeviceTopicQuery,
			deleteDeviceTopicAll:            sqliteDeleteDeviceTopicAllQuery,
			deleteDeviceTopicWithoutDevice:  sqliteDeleteDeviceTopicWithoutDeviceQuery,
		},
	}, nil
}

func runSQLiteStartupQueries(db *sql.DB, startupQueries string) error {
	if _, err := db.Exec(startupQueries); err != nil {
		return err
	}
	if _, err := db.Exec(sqliteBuiltinStartupQueries); err != nil {
		return err
	}
	return nil
}
