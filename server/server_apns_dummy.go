//go:build noapns

package server

import (
	"context"
	"errors"
	"net/http"

	"heckel.io/ntfy/v2/apns"
	"heckel.io/ntfy/v2/db"
	"heckel.io/ntfy/v2/model"
)

const (
	// APNSAvailable is false in builds with the 'noapns' tag.
	APNSAvailable = false
)

type apnsSender interface {
	Send(ctx context.Context, n *apns.Notification) error
}

func createAPNS(conf *Config, _ *db.DB) (*apns.Store, apnsSender, error) {
	if conf.APNSKeyFile != "" {
		return nil, nil, errors.New("APNs not available")
	}
	return nil, nil, nil
}

func (s *Server) handleAPNSDeviceUpdate(w http.ResponseWriter, r *http.Request, v *visitor) error {
	return errHTTPNotFound
}

func (s *Server) handleAPNSDeviceDelete(w http.ResponseWriter, r *http.Request, _ *visitor) error {
	return errHTTPNotFound
}

func (s *Server) publishToAPNSDevices(v *visitor, m *model.Message) {
}

func (s *Server) pruneAPNSDevices() {
}
