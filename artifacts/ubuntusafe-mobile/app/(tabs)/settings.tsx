import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { languages } from "@/constants/i18n";
import { ApiConnectionCheck } from "@/components/ApiConnectionCheck";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    colors,
    t,
    user,
    signOut,
    language,
    setLanguage,
    isDark,
    toggleTheme,
    enableBiometrics,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const changeBiometrics = async (enabled: boolean) => {
    try {
      const verified = await enableBiometrics(enabled);
      if (enabled && !verified)
        Alert.alert(
          "Verification cancelled",
          "Biometric unlock was not turned on.",
        );
    } catch (error) {
      Alert.alert(
        "Biometrics unavailable",
        error instanceof Error
          ? error.message
          : "Check your device settings and try again.",
      );
    }
  };
  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
      router.replace("/");
    } catch (error) {
      Alert.alert(
        "Could not log out",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.eyebrow, { color: colors.primary }]}>
        UBUNTUSAFE
      </Text>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t("settings")}
      </Text>
      <View
        style={[
          styles.profile,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.avatar, { color: colors.primary }]}>
          {user?.fullName[0]?.toUpperCase()}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: "800" }}>
            {user?.fullName}
          </Text>
        </View>
      </View>
      <Text style={[styles.group, { color: colors.mutedForeground }]}>
        {t("language")}
      </Text>
      <Pressable
        testID="language-dropdown"
        accessibilityRole="button"
        accessibilityLabel={`${t("language")}: ${language}`}
        onPress={() => setLanguagePickerOpen(true)}
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: colors.foreground }}>{t("language")}</Text>
        <View style={styles.dropdownValue}>
          <Text style={{ color: colors.primary }}>{language}</Text>
          <Feather name="chevron-down" size={18} color={colors.primary} />
        </View>
      </Pressable>
      <View
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: colors.foreground }}>{t("darkMode")}</Text>
        <Switch
          value={isDark}
          onValueChange={() => void toggleTheme()}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      <View
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: colors.foreground }}>{t("fingerprint")}</Text>
        <Switch
          value={Boolean(user?.biometricsEnabled)}
          onValueChange={(enabled) => void changeBiometrics(enabled)}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Your device verifies your face or fingerprint. UbuntuSafe never receives
        or stores biometric data.
      </Text>
      <ApiConnectionCheck />
      <Pressable
        onPress={() => router.push("/report")}
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: colors.foreground }}>{t("reportScam")}</Text>
        <Text style={{ color: colors.primary }}>›</Text>
      </Pressable>
      <Pressable
        testID="backup-link"
        accessibilityRole="button"
        onPress={() => router.push("/backup")}
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: colors.foreground }}>Backups and restore</Text>
        <Text style={{ color: colors.primary }}>›</Text>
      </Pressable>
      <Pressable
        testID="logout-button"
        disabled={busy}
        onPress={() => void logout()}
        style={[
          styles.logout,
          { borderColor: colors.primary, backgroundColor: colors.primary },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
            {t("signOut")}
          </Text>
        )}
      </Pressable>
      <Modal
        visible={languagePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguagePickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLanguagePickerOpen(false)}
        >
          <Pressable
            onPress={() => undefined}
            style={[
              styles.languageMenu,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.menuTitle, { color: colors.foreground }]}>
              {t("language")}
            </Text>
            <ScrollView>
              {languages.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item === language }}
                  onPress={async () => {
                    await setLanguage(item);
                    setLanguagePickerOpen(false);
                  }}
                  style={[
                    styles.languageOption,
                    item === language && {
                      backgroundColor: colors.secondary,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.foreground,
                      fontWeight: item === language ? "800" : "500",
                    }}
                  >
                    {item}
                  </Text>
                  {item === language && (
                    <Feather name="check" size={18} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 22, paddingTop: 58 },
  content: { paddingBottom: 28 },
  eyebrow: { fontWeight: "800", letterSpacing: 2 },
  title: { fontSize: 31, fontWeight: "800", marginTop: 8 },
  profile: {
    minHeight: 78,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
  },
  avatar: { fontSize: 24, fontWeight: "800" },
  dropdownValue: { flexDirection: "row", alignItems: "center", gap: 8 },
  group: {
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 26,
    marginBottom: 8,
  },
  row: {
    minHeight: 55,
    borderWidth: 1,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    borderRadius: 14,
  },
  hint: { fontSize: 12, lineHeight: 18, marginTop: -1, marginBottom: 8 },
  logout: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 28,
  },
  languageMenu: {
    maxHeight: "75%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
  },
  menuTitle: { fontSize: 18, fontWeight: "800", padding: 12 },
  languageOption: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
