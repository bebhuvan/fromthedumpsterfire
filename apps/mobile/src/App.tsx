import { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { linking, navRef, type Routes, type Tabs } from './nav';
import { usePalette, useScheme } from './theme';
import { retryPushRegistration } from './lib/push';
import { TabBar } from './ui/TabBar';
import {
  AboutRoute,
  ArchiveRoute,
  HaulRoute,
  ItemRoute,
  LatestRoute,
  MenuRoute,
  NoteRoute,
  SavedRoute,
  SearchRoute,
  SettingsRoute,
  ShelfRoute,
  AtlasRoute,
  StoryRoute,
  BookRoute,
  ThreadRoute,
  ThreadsRoute,
} from './routes';

const Stack = createNativeStackNavigator<Routes>();
const Tab = createBottomTabNavigator<Tabs>();

function TabsScreen() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, lazy: true }}>
      <Tab.Screen name="Latest" component={LatestRoute} />
      <Tab.Screen name="Threads" component={ThreadsRoute} />
      <Tab.Screen name="Archive" component={ArchiveRoute} />
      <Tab.Screen name="Search" component={SearchRoute} />
      <Tab.Screen name="Menu" component={MenuRoute} />
    </Tab.Navigator>
  );
}

export default function App() {
  const p = usePalette();
  const dark = useScheme() === 'dark';

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(p.bg);
  }, [p.bg]);
  useEffect(retryPushRegistration, []);

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: p.bg, card: p.bg, text: p.ink, border: p.rule, primary: p.ink } };

  return (
    <SafeAreaProvider style={{ backgroundColor: p.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <NavigationContainer ref={navRef} linking={linking} theme={theme}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: p.bg } }}>
          <Stack.Screen name="Tabs" component={TabsScreen} />
          <Stack.Screen name="Haul" component={HaulRoute} />
          <Stack.Screen name="Note" component={NoteRoute} />
          <Stack.Screen name="Item" component={ItemRoute} />
          <Stack.Screen name="Thread" component={ThreadRoute} />
          <Stack.Screen name="Saved" component={SavedRoute} />
          <Stack.Screen name="About" component={AboutRoute} />
          <Stack.Screen name="Settings" component={SettingsRoute} />
          <Stack.Screen name="Shelf" component={ShelfRoute} />
          <Stack.Screen name="Book" component={BookRoute} />
          <Stack.Screen name="Atlas" component={AtlasRoute} />
          <Stack.Screen name="Story" component={StoryRoute} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
