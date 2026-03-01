package server

import "testing"

func TestGetGroundUnitModes(t *testing.T) {
	config := &TacViewServerConfig{
		EnableFriendlyGroundUnits: true,
		EnableEnemyGroundUnits:    false,
	}

	modes := getGroundUnitModes(config)

	if len(modes) != 1 || modes[0] != "friendly" {
		t.Fatalf("expected [friendly], got %v", modes)
	}

	config.EnableEnemyGroundUnits = true
	modes = getGroundUnitModes(config)

	if len(modes) != 2 || modes[0] != "enemy" || modes[1] != "friendly" {
		t.Fatalf("expected [enemy friendly], got %v", modes)
	}
}

func TestGetFlightUnitModes(t *testing.T) {
	config := &TacViewServerConfig{
		EnableFriendlyFlightUnits: true,
		EnableEnemyFlightUnits:    false,
	}

	modes := getFlightUnitModes(config)

	if len(modes) != 1 || modes[0] != "friendly" {
		t.Fatalf("expected [friendly], got %v", modes)
	}

	config.EnableEnemyFlightUnits = true
	modes = getFlightUnitModes(config)

	if len(modes) != 2 || modes[0] != "enemy" || modes[1] != "friendly" {
		t.Fatalf("expected [enemy friendly], got %v", modes)
	}
}

