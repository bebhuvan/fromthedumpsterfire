import { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme } from 'react-native';
import { linking, navRef, type Routes } from './nav';
import { usePalette } from './theme';
import { AboutRoute, ArchiveRoute, HaulRoute, ItemRoute, LatestRoute, NoteRoute, ThreadRoute } from './routes';

const Stack = createNativeStackNavigator<Routes>();

export default function App() {
  const p = usePalette();
  const dark = useColorScheme() === 'dark';
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(p.bg);
  }, [p.bg]);

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: p.bg, card: p.bg, text: p.ink, border: p.rule, primary: p.ink } };

  return (
    <SafeAreaProvider style={{ backgroundColor: p.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <NavigationContainer ref={navRef} linking={linking} theme={theme}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: p.bg } }}>
          <Stack.Screen name="Latest" component={LatestRoute} />
          <Stack.Screen name="Haul" component={HaulRoute} />
          <Stack.Screen name="Note" component={NoteRoute} />
          <Stack.Screen name="Item" component={ItemRoute} />
          <Stack.Screen name="Thread" component={ThreadRoute} />
          <Stack.Screen name="Archive" component={ArchiveRoute} />
          <Stack.Screen name="About" component={AboutRoute} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
