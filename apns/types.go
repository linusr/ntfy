package apns

import "heckel.io/ntfy/v2/log"

// Environments a device token can belong to. Tokens issued to development-signed builds are only
// accepted by the sandbox gateway; TestFlight and App Store builds use production.
const (
	EnvironmentProduction = "production"
	EnvironmentSandbox    = "sandbox"
)

// Device represents an iOS/watchOS app installation registered for APNs delivery.
type Device struct {
	ID          string
	Token       string
	Environment string
	UserID      string
}

// Context returns the logging context for the device.
func (d *Device) Context() log.Context {
	return map[string]any{
		"apns_device_id":          d.ID,
		"apns_device_user_id":     d.UserID,
		"apns_device_environment": d.Environment,
		"apns_device_token":       maybeShortenToken(d.Token),
	}
}

func maybeShortenToken(token string) string {
	if len(token) <= 12 {
		return token
	}
	return token[:12] + "..."
}
