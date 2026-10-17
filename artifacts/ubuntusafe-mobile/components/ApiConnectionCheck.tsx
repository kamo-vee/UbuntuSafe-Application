import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import {
  checkApiHealth,
  getApiUrlForDisplay,
  type ApiHealthResult,
} from "@/lib/api";

export function ApiConnectionCheck() {
  const { colors } = useApp();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ApiHealthResult | null>(null);

  const runCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      setResult(await checkApiHealth());
    } finally {
      setChecking(false);
    }
  };

  const resultColor =
    result?.status === "healthy" ? colors.primary : colors.destructive;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.heading}>
        <Feather name="wifi" size={17} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          API connection
        </Text>
      </View>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        Configured API URL
      </Text>
      <Text
        selectable
        accessibilityLabel={`Configured API URL: ${getApiUrlForDisplay()}`}
        style={[styles.url, { color: colors.foreground }]}
      >
        {getApiUrlForDisplay()}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: checking, busy: checking }}
        disabled={checking}
        onPress={() => void runCheck()}
        style={[styles.button, { backgroundColor: colors.secondary }]}
      >
        {checking ? (
          <ActivityIndicator size="small" color={colors.secondaryForeground} />
        ) : (
          <Feather
            name="refresh-cw"
            size={15}
            color={colors.secondaryForeground}
          />
        )}
        <Text
          style={[styles.buttonText, { color: colors.secondaryForeground }]}
        >
          {checking ? "Checking…" : "Check connection"}
        </Text>
      </Pressable>
      {result && (
        <View
          accessibilityLiveRegion="polite"
          style={styles.result}
          testID="api-health-result"
        >
          <Text style={[styles.resultTitle, { color: resultColor }]}>
            {result.status === "healthy"
              ? "Connected"
              : result.status === "database_unavailable"
                ? "Database unavailable"
                : result.status === "unreachable"
                  ? "API not reachable"
                  : result.status === "api_error"
                    ? "API reported an error"
                    : "API URL not configured"}
          </Text>
          <Text style={[styles.message, { color: colors.foreground }]}>
            {result.message}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontWeight: "800", fontSize: 15 },
  label: { fontSize: 11, fontWeight: "700", marginTop: 12 },
  url: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  button: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 11,
    marginTop: 12,
  },
  buttonText: { fontWeight: "700", fontSize: 13 },
  result: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#8886",
    marginTop: 12,
    paddingTop: 10,
  },
  resultTitle: { fontWeight: "800", fontSize: 13 },
  message: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
