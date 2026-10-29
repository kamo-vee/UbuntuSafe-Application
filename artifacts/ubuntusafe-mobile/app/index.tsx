import { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { languages } from "@/constants/i18n";

export default function WelcomeScreen() {
  const router = useRouter();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const {
    colors,
    t,
    user,
    hydrated,
    language,
    setLanguage,
    isDark,
    toggleTheme,
  } = useApp();

  if (!hydrated)
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (user) return <Redirect href="/(tabs)" />;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.brand}><Image source={require("../assets/ubuntusafe-mark.png")} style={{ width: 108, height: 108 }} resizeMode="contain" /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>UbuntuSafe</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {t("welcomeTagline")}
      </Text>
      <View style={styles.preferences}>
        <Pressable
          testID="welcome-language-dropdown"
          accessibilityRole="button"
          accessibilityLabel={`${t("language")}: ${language}`}
          onPress={() => setLanguagePickerOpen(true)}
          style={[
            styles.preferenceRow,
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
            styles.preferenceRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={{ color: colors.foreground }}>{t("darkMode")}</Text>
          <Switch
            testID="welcome-theme-switch"
            accessibilityLabel={t("darkMode")}
            value={isDark}
            onValueChange={() => void toggleTheme()}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>
      <Pressable
        onPress={() => router.push("/role-select")}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={{ color: colors.primaryForeground }}>
          {t("getProtected")}
        </Text>
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
            <ScrollView showsVerticalScrollIndicator={false}>
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
                    item === language && { backgroundColor: colors.secondary },
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
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 28, justifyContent: "center", gap: 16 },
  brand: { alignItems: "center", marginBottom: 12 },
  title: { fontSize: 38, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  preferences: { gap: 10, marginTop: 4 },
  preferenceRow: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownValue: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  languageMenu: {
    maxHeight: "75%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  menuTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  languageOption: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
});
