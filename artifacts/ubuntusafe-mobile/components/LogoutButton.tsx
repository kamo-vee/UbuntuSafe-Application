import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";

export function LogoutButton({ disabled = false }: { disabled?: boolean }) {
  const { colors, signOut } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Log out" disabled={busy || disabled}
      onPress={async () => {
        setBusy(true); setError("");
        try { await signOut(); router.replace("/user-access"); }
        catch { setError("Could not finish logging out. Try again."); }
        finally { setBusy(false); }
      }}
      style={{ minHeight: 44, paddingHorizontal: 15, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, opacity: busy || disabled ? 0.6 : 1 }}>
      <Text style={{ color: colors.primary, fontWeight: "700" }}>{busy ? "Logging out..." : "Log out"}</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
  </>;
}
