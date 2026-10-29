import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform, useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { copy, languages, type Language } from "@/constants/i18n";
import { apiRequest, clearAuthToken, getAuthToken, saveAuthToken } from "@/lib/api";
import { clearCachedUserData, initLocalDb } from "@/lib/localDb";

export type AppUser = {
  id: string;
  fullName: string;
  surname?: string;
  dateOfBirth?: string | null;
  email: string;
  phone?: string | null;
  language: Language;
  biometricsEnabled: boolean;
  verificationRequired?: boolean;
  verificationEmailSent?: boolean;
};
export type LocalActivity = {
  id: string;
  title: string;
  detail: string;
  status: "safe" | "warning" | "danger" | "pending";
};
type ThemeMode = "light" | "dark";
type AuthResponse = {
  verificationRequired?: boolean;
  verificationEmailSent?: boolean;
  token: string;
  user: { id: string; fullName: string; email: string; surname?: string; dateOfBirth?: string | null; phone?: string | null };
};
type ContextValue = {
  user: AppUser | null;
  biometricUser: AppUser | null;
  biometricAvailable: boolean;
  locked: boolean;
  hydrated: boolean;
  language: Language;
  isDark: boolean;
  colors: typeof colors.light | typeof colors.dark;
  t: (key: keyof typeof copy.English) => string;
  signIn: (
    email: string,
    password: string,
    biometricsEnabled?: boolean,
  ) => Promise<void>;
  register: (
    fullName: string,
    surname: string,
    dateOfBirth: string,
    email: string,
    phone: string | null,
    password: string,
    biometricsEnabled: boolean,
  ) => Promise<AppUser>;
  signOut: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
  toggleTheme: () => Promise<void>;
  enableBiometrics: (
    enabled: boolean,
    targetUser?: AppUser,
  ) => Promise<boolean>;
  biometricSignIn: () => Promise<boolean>;
  usePasswordInstead: () => void;
  localActivities: LocalActivity[];
  addLocalActivity: (activity: LocalActivity) => Promise<void>;
  clearLocalActivities: () => void;
};

const SESSION_KEY = "ubuntusafe.session";
const THEME_KEY = "ubuntusafe.theme";
const LANGUAGE_KEY = "ubuntusafe.language";
const AppContext = createContext<ContextValue | null>(null);

function readSession() {
  return Platform.OS === "web"
    ? AsyncStorage.getItem(SESSION_KEY)
    : SecureStore.getItemAsync(SESSION_KEY);
}

function writeSession(value: string | null) {
  if (Platform.OS === "web") {
    return value
      ? AsyncStorage.setItem(SESSION_KEY, value)
      : AsyncStorage.removeItem(SESSION_KEY);
  }
  return value
    ? SecureStore.setItemAsync(SESSION_KEY, value)
    : SecureStore.deleteItemAsync(SESSION_KEY);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const scheme = useColorScheme();
  const [user, setUser] = useState<AppUser | null>(null);
  const [biometricUser, setBiometricUser] = useState<AppUser | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const authPromptActive = useRef(false);
  const [language, setLanguageState] = useState<Language>("English");
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    scheme === "dark" ? "dark" : "light",
  );
  const [localActivities, setLocalActivities] = useState<LocalActivity[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      await initLocalDb();
      const [session, storedLanguage, storedTheme] = await Promise.all([
        readSession(),
        AsyncStorage.getItem(LANGUAGE_KEY),
        AsyncStorage.getItem(THEME_KEY),
      ]);
      if (session) {
        const savedUser = JSON.parse(session) as AppUser;
        if (savedUser.biometricsEnabled) {
          setBiometricUser(savedUser);
          const [hasHardware, isEnrolled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
          ]);
          setBiometricAvailable(hasHardware && isEnrolled);
        } else {
          setUser(savedUser);
        }
      }
      const savedLanguage =
        storedLanguage === "itsonga" ? `X${storedLanguage}` : storedLanguage;
      if (
        savedLanguage &&
        (languages as readonly string[]).includes(savedLanguage)
      )
        setLanguageState(savedLanguage as Language);
      if (storedTheme === "light" || storedTheme === "dark")
        setThemeMode(storedTheme);
      setHydrated(true);
    })().catch(() => setHydrated(true));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        !authPromptActive.current &&
        (nextState === "inactive" || nextState === "background") &&
        user?.biometricsEnabled
      ) {
        setBiometricUser(user);
        setLocked(true);
      }
    });
    return () => subscription.remove();
  }, [user]);

  const persistSession = async (nextUser: AppUser | null) => {
    await writeSession(nextUser ? JSON.stringify(nextUser) : null);
  };
  const signIn = async (
    email: string,
    password: string,
    biometricsEnabled?: boolean,
  ) => {
    const normalized = email.trim().toLowerCase();
    const response = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalized, password }),
    });
    await saveAuthToken(response.token);
    const keepBiometrics =
      biometricsEnabled ??
      (biometricUser?.email === normalized &&
        biometricUser.biometricsEnabled &&
        biometricAvailable);
    const nextUser = {
      ...response.user,
      language,
      biometricsEnabled: keepBiometrics,
    };
    setUser(nextUser);
    setBiometricUser(keepBiometrics ? nextUser : null);
    setLocked(false);
    await persistSession(nextUser);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const register = async (
    fullName: string,
    surname: string,
    dateOfBirth: string,
    email: string,
    phone: string | null,
    password: string,
    biometricsEnabled: boolean,
  ) => {
    const normalized = email.trim().toLowerCase();
    const response = await apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        fullName,
        surname,
        dateOfBirth,
        email: normalized,
        phone,
        password,
        language,
      }),
    });
    const nextUser = {
      ...response.user, language, biometricsEnabled,
      verificationRequired: response.verificationRequired,
      verificationEmailSent: response.verificationEmailSent,
    };
    // A pending registration must not establish an authenticated dashboard session.
    if (response.verificationRequired) return nextUser;
    await saveAuthToken(response.token);
    setUser(nextUser);
    setBiometricUser(null);
    setBiometricAvailable(false);
    setLocked(false);
    await persistSession(nextUser);
    return nextUser;
  };
  const signOut = async () => {
    const token = await getAuthToken().catch(() => null);
    if (token) {
      await apiRequest<void>("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await clearAuthToken();
    } finally {
      try {
        await persistSession(null);
      } finally {
        setUser(null);
        setBiometricUser(null);
        setBiometricAvailable(false);
        setLocked(false);
        setLocalActivities([]);
      }
    }
    await clearCachedUserData().catch(() => undefined);
  };
  const setLanguage = async (next: Language) => {
    setLanguageState(next);
    await AsyncStorage.setItem(LANGUAGE_KEY, next);
    if (user) {
      const nextUser = { ...user, language: next };
      setUser(nextUser);
      await persistSession(nextUser);
    }
  };
  const toggleTheme = async () => {
    const next = themeMode === "light" ? "dark" : "light";
    setThemeMode(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  };
  const enableBiometrics = async (enabled: boolean, targetUser = user) => {
    if (!targetUser) return false;
    if (!enabled) {
      const nextUser = { ...targetUser, biometricsEnabled: false };
      setUser(nextUser);
      setBiometricUser(null);
      setBiometricAvailable(false);
      await persistSession(nextUser);
      return true;
    }
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware)
      throw new Error("This device does not have a biometric sensor.");
    if (!isEnrolled)
      throw new Error("Set up Face ID or a fingerprint in your device settings first.");
    authPromptActive.current = true;
    let result: LocalAuthentication.LocalAuthenticationResult;
    try {
      result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verify your UbuntuSafe identity",
        cancelLabel: "Cancel",
      });
    } finally {
      authPromptActive.current = false;
    }
    if (result.success && targetUser) {
      const nextUser = { ...targetUser, biometricsEnabled: true };
      setUser(nextUser);
      setBiometricUser(nextUser);
      setBiometricAvailable(true);
      setLocked(false);
      await persistSession(nextUser);
    }
    return result.success;
  };
  const biometricSignIn = async () => {
    if (!biometricUser || !biometricAvailable) return false;
    authPromptActive.current = true;
    let result: LocalAuthentication.LocalAuthenticationResult;
    try {
      result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock UbuntuSafe",
        cancelLabel: "Use password",
      });
    } finally {
      authPromptActive.current = false;
    }
    if (!result.success) return false;
    setUser(biometricUser);
    setLocked(false);
    await persistSession(biometricUser);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  };
  const usePasswordInstead = () => {
    setUser(null);
    setLocked(false);
  };
  const addLocalActivity = async (activity: LocalActivity) =>
    setLocalActivities((items) =>
      [activity, ...items.filter((item) => item.id !== activity.id)].slice(
        0,
        20,
      ),
    );
  const clearLocalActivities = () => setLocalActivities([]);
  const value = useMemo<ContextValue>(
    () => ({
      user,
      biometricUser,
      biometricAvailable,
      locked,
      hydrated,
      language,
      isDark: themeMode === "dark",
      colors: themeMode === "dark" ? colors.dark : colors.light,
      t: (key) => copy[language][key],
      signIn,
      register,
      signOut,
      setLanguage,
      toggleTheme,
      enableBiometrics,
      biometricSignIn,
      usePasswordInstead,
      localActivities,
      addLocalActivity,
      clearLocalActivities,
    }),
    [
      user,
      biometricUser,
      biometricAvailable,
      locked,
      hydrated,
      language,
      themeMode,
      localActivities,
    ],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
