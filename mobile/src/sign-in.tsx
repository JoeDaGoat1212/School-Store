import { type ComponentRef, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signIn } from "./api";
import { radius, score, useColors } from "./theme";
import { EMBER, glass, Shine } from "./fx";
import { LinearGradient } from "expo-linear-gradient";

export function SignIn({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<ComponentRef<typeof TextInput>>(null);

  const ready = name.trim().length > 0 && pin.length === 4 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(name.trim(), pin);
      await onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in. Try again.");
      setPin("");
      setBusy(false);
    }
  };

  const field = [styles.field, { borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(0,0,0,0.25)", color: c.ink }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Image source={require("../assets/icon.png")} style={styles.logo} />
        <Text style={[styles.title, { color: c.ink }]}>
          Firebirds{"\n"}
          <Text style={{ color: "#ff7a45", textShadowColor: "rgba(255,90,31,0.7)", textShadowRadius: 22 }}>Nest</Text>
        </Text>
        <Text style={[styles.lead, { color: "rgba(255,255,255,0.65)" }]}>Clock in and out, and see your store credit and schedule.</Text>

        <View style={[styles.sheet, glass]}>
          <Text style={[styles.label, { color: c.muted }]}>Your name</Text>
          <TextInput
            style={field}
            value={name}
            onChangeText={setName}
            placeholder="First name and last initial"
            placeholderTextColor={c.muted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => pinRef.current?.focus()}
            maxLength={40}
          />
          <Text style={[styles.label, { color: c.muted, marginTop: 16 }]}>Your 4-digit PIN</Text>
          <TextInput
            ref={pinRef}
            style={[field, score, styles.pin]}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder="••••"
            placeholderTextColor={c.input}
            onSubmitEditing={submit}
          />
          <Text style={[styles.hint, { color: c.muted }]}>The same PIN you use on the store tablet.</Text>

          {error && <Text style={[styles.error, { color: c.red }]}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={!ready}
            style={({ pressed }) => [styles.button, { opacity: ready ? (pressed ? 0.9 : 1) : 0.4, transform: [{ scale: pressed ? 0.985 : 1 }] }]}
          >
            <LinearGradient colors={[...EMBER]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {ready && !busy && <Shine />}
            {busy ? <ActivityIndicator color="#000" /> : <Text style={[styles.buttonText, { color: "#140a07", fontWeight: "900" }]}>Sign in</Text>}
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: c.muted, textAlign: "center", marginTop: 16 }]}>You stay signed in on this phone.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20 },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 20 },
  title: { fontSize: 64, lineHeight: 64, fontFamily: score?.fontFamily, fontWeight: "700" },
  lead: { fontSize: 15, lineHeight: 21, marginTop: 6, marginBottom: 24 },
  sheet: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sheet, padding: 20 },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  field: { height: 52, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 14, fontSize: 17 },
  pin: { fontSize: 30, letterSpacing: 18, textAlign: "center", width: 180, height: 60 },
  hint: { fontSize: 13, marginTop: 8 },
  error: { fontSize: 14, fontWeight: "600", marginTop: 14 },
  button: { height: 58, borderRadius: radius.control, alignItems: "center", justifyContent: "center", marginTop: 20, overflow: "hidden" },
  buttonText: { fontSize: 17, fontWeight: "600" },
});
