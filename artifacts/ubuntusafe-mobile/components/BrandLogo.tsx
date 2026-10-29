import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useApp } from "@/context/AppContext";

type BrandLogoProps = {
  iconSize?: number;
  textSize?: number;
  style?: ViewStyle;
};

export function BrandLogo({
  iconSize = 42,
  textSize = 20,
  style,
}: BrandLogoProps) {
  const { colors } = useApp();
  return (
    <View style={[styles.row, style]} accessibilityLabel="UbuntuSafe">
      <Image
        source={require("../assets/ubuntusafe-mark.png")}
        style={{ width: iconSize, height: iconSize }}
        resizeMode="contain"
        accessibilityLabel="UbuntuSafe shield and check logo"
      />
      <Text style={{ color: colors.primary, fontSize: textSize, fontWeight: "800" }}>
        UbuntuSafe
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
});
