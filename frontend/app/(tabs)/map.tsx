import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api, Mission } from "@/src/api";
import { useTheme } from "@/src/theme-context";
import { Txt } from "@/src/components/Txt";
import { radius, spacing, shadowCard } from "@/src/theme";

type Pin = {
  id: string;
  title: string;
  subtitle: string;
  status: "completed" | "open" | "reported" | "reserved" | "expired" | "robot-detected";
  lat: number;
  lng: number;
  onPress?: () => void;
};

export default function MapScreen() {
  const t = useTheme();
  const [pins, setPins] = useState<Pin[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "completed" | "reported" | "robot" | "reserved">("all");

  // Fetch GPS User Location
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Denied", "Enable location permissions to view your position on the map.");
          setLoadingLocation(false);
          return;
        }

        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (err) {
        console.warn("Error getting location:", err);
      } finally {
        setLoadingLocation(false);
      }
    })();
  }, []);

  // Fetch Pin Data
  const load = useCallback(async () => {
    try {
      const [missions, cleanups, reports] = await Promise.all([
        api.listMissions(),
        api.allCleanups(),
        api.listReports(),
      ]);
      const now = Date.now();
      const missionPins: Pin[] = (missions as Mission[]).map((m) => {
        const expired = m.expires_at ? new Date(m.expires_at).getTime() < now : false;
        const reserved = m.claimed_until ? new Date(m.claimed_until).getTime() > now : false;
        let status: Pin["status"] = "open";
        if (m.status === "completed") status = "completed";
        else if (expired) status = "expired";
        else if (reserved) status = "reserved";
        else if (m.source === "robot") status = "robot-detected";
        return {
          id: `mission-${m.id}`,
          title: m.title,
          subtitle: `${m.location} • ${m.points} pts${m.source === "robot" ? " • robot" : ""}`,
          status,
          lat: m.lat,
          lng: m.lng,
          onPress: m.status !== "completed"
            ? () => router.push({ pathname: "/cleanup", params: { mission_id: m.id, difficulty: m.difficulty } })
            : undefined,
        };
      });

      const cleanupPins: Pin[] = cleanups.slice(0, 30).map((c: any, i: number) => ({
        id: `cleanup-${c.id || i}`,
        title: "Cleanup completed",
        subtitle: new Date(c.created_at).toLocaleDateString(),
        status: "completed",
        lat: c.lat,
        lng: c.lng,
      }));

      const reportPins: Pin[] = reports.slice(0, 30).map((r: any) => ({
        id: `report-${r.id}`,
        title: "Reported litter",
        subtitle: r.description || "Needs cleanup",
        status: "reported",
        lat: r.lat,
        lng: r.lng,
      }));

      setPins([...missionPins, ...reportPins, ...cleanupPins]);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = pins.filter((p) => {
    if (filter === "all") return true;
    if (filter === "robot") return p.status === "robot-detected";
    if (filter === "reserved") return p.status === "reserved";
    if (filter === "open") return p.status === "open" || p.status === "robot-detected";
    return p.status === filter;
  });

  const getPinColor = (status: Pin["status"]) => {
    switch (status) {
      case "completed": return "green";
      case "reserved": return "blue";
      case "reported": return "red";
      case "robot-detected": return "purple";
      case "expired": return "gray";
      default: return "orange";
    }
  };

  const defaultRegion = {
    latitude: userLocation?.latitude || 37.78825,
    longitude: userLocation?.longitude || -122.4324,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.surface }}>
      {/* Google Map Container */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={defaultRegion}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsCompass={true}
      >
        {filtered.map((item) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.lat, longitude: item.lng }}
            pinColor={getPinColor(item.status)}
          >
            <Callout onPress={item.onPress}>
              <View style={styles.callout}>
                <Txt weight="medium">{item.title}</Txt>
                <Txt variant="caption" color={t.onSurfaceSecondary}>{item.subtitle}</Txt>
                {item.onPress && (
                  <Txt variant="small" style={{ color: t.brand, marginTop: 4, fontWeight: "bold" }}>
                    Tap to Start Cleanup →
                  </Txt>
                )}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Floating Header */}
      <SafeAreaView edges={["top"]} style={styles.floatingHeader}>
        <View style={[styles.headerCard, shadowCard, { backgroundColor: t.surface }]}>
          <Txt variant="title" weight="medium">Nearby Cleanups</Txt>
          <Txt variant="caption" color={t.onSurfaceSecondary}>
            Tap a marker to view details and start a cleanup.
          </Txt>
        </View>
      </SafeAreaView>

      {loadingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={t.brand} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingHeader: {
    position: "absolute",
    top: 10,
    left: spacing.lg,
    right: spacing.lg,
  },
  headerCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  callout: {
    width: 180,
    padding: spacing.xs,
  },
  loadingOverlay: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.8)",
    padding: spacing.md,
    borderRadius: radius.pill,
  },
});
