import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadAuth, onAuthChange } from './src/api/client';
import { RootStackParamList } from './src/navigation/types';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import CheckInScreen from './src/screens/CheckInScreen';
import CheckOutScreen from './src/screens/CheckOutScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';
import PayslipScreen from './src/screens/PayslipScreen';
import LeavesScreen from './src/screens/LeavesScreen';
import ApplyLeaveScreen from './src/screens/ApplyLeaveScreen';
import HolidaysScreen from './src/screens/HolidaysScreen';
import { colors } from './src/theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Minimum time the splash should be visible. This avoids a jarring "flash" on
// fast loads where loadAuth resolves in ~50ms. 900ms is enough to register
// the brand without feeling sluggish.
const MIN_SPLASH_MS = 900;
// Time we let the splash play its fade-out animation before unmounting it.
const FADE_OUT_MS = 280;

export default function App() {
  /** auth resolved AND minimum splash window elapsed */
  const [bootDone, setBootDone] = useState(false);
  /** start the splash fade-out animation */
  const [fading, setFading]     = useState(false);
  /** splash fully gone — render the navigator from this point on */
  const [splashHidden, setSplashHidden] = useState(false);

  const [authed, setAuthed] = useState(false);
  const navigationReady = useRef(false);

  useEffect(() => {
    const startedAt = Date.now();
    let authLoaded = false;
    let minElapsed = false;

    const finish = () => {
      if (authLoaded && minElapsed) setBootDone(true);
    };

    loadAuth().then((s) => {
      setAuthed(!!s);
      authLoaded = true;
      finish();
    });

    const timer = setTimeout(() => {
      minElapsed = true;
      finish();
    }, Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt)));

    const unsubscribe = onAuthChange((reason) => {
      if (reason === 'manual') return;
      if (navigationReady.current && navigationRef.isReady()) {
        navigationRef.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Once boot is done, start the fade-out animation.
  useEffect(() => {
    if (bootDone) setFading(true);
  }, [bootDone]);

  // Once the fade-out animation starts, schedule the actual unmount. Split
  // from the effect above so the cleanup doesn't cancel its own timer when
  // setFading triggers a re-render.
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => setSplashHidden(true), FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [fading]);

  // While the splash is still visible, render only it. We render it inside the
  // SafeAreaProvider so dependencies like react-native-safe-area-context work.
  if (!splashHidden) {
    return (
      <SafeAreaProvider>
        <SplashScreen fadeOut={fading} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <NavigationContainer
        ref={navigationRef}
        onReady={() => { navigationReady.current = true; }}
      >
        <Stack.Navigator
          initialRouteName={authed ? 'Home' : 'Login'}
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTitleStyle: { fontWeight: '700', color: colors.text },
            headerTintColor: colors.primary,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Login"       component={LoginScreen}       options={{ headerShown: false }} />
          <Stack.Screen name="Home"        component={HomeScreen}        options={{ headerShown: false }} />
          <Stack.Screen name="Profile"     component={ProfileScreen}     options={{ headerShown: false }} />
          <Stack.Screen name="CheckIn"     component={CheckInScreen}     options={{ headerShown: false }} />
          <Stack.Screen name="CheckOut"    component={CheckOutScreen}    options={{ headerShown: false }} />
          <Stack.Screen name="Attendance"  component={AttendanceScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="Payslip"     component={PayslipScreen}     options={{ headerShown: false }} />
          <Stack.Screen name="Leaves"      component={LeavesScreen}      options={{ headerShown: false }} />
          <Stack.Screen name="ApplyLeave"  component={ApplyLeaveScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="Holidays"    component={HolidaysScreen}    options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
