import { ScrollView, StyleSheet, Text } from "react-native";
import { useApp } from "@/context/AppContext";
export default function PrivacyScreen() {
  const { colors } = useApp();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>
        UbuntuSafe privacy policy
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        UbuntuSafe checks content locally first. When you are online, an
        authenticated scan may be sent to your UbuntuSafe server for community
        protection. Passwords are hashed and tokens are stored in the device
        secure store. Face or fingerprint checks run on your device; UbuntuSafe
        does not receive or store biometric data. Cached scans and queued
        reports are removed when you log out.
      </Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 70 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 18 },
  body: { fontSize: 16, lineHeight: 25 },
});
