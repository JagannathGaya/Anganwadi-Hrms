# mobile

Employee mobile app for **AnganwadiHrms**. React Native CLI 0.75 + TypeScript.

This folder contains the JS/TS application source. The native iOS/Android
shells are not committed — they're regenerated via `react-native init` so they
match your local toolchain (Xcode / Android SDK / NDK versions).

## Requirements

- Node.js 20+
- Watchman (`brew install watchman`)
- For iOS: Xcode 15+, CocoaPods (`sudo gem install cocoapods`)
- For Android: Android Studio + JDK 17 + an emulator/device with API 24+

Refer to the official RN env setup if anything below fails:
https://reactnative.dev/docs/environment-setup

## First-time setup (generate native shells)

```bash
cd mobile

# 1. Install JS deps
npm install

# 2. Generate the native iOS + Android projects beside the existing source.
#    --skip-install keeps the current package.json and node_modules.
npx @react-native-community/cli init AnganwadiHrmsMobile \
  --version 0.75.4 \
  --template react-native-template-typescript \
  --skip-install \
  --directory ./.native-template

# 3. Move the generated ios/ and android/ folders up into ./
mv ./.native-template/ios ./ios
mv ./.native-template/android ./android
rm -rf ./.native-template

# 4. iOS only: install pods
cd ios && pod install && cd ..
```

After that, `ios/` and `android/` are normal RN native projects you can edit
and version normally.

### Permissions

Add the following so the GPS prompt fires at runtime.

**iOS — `ios/AnganwadiHrmsMobile/Info.plist`:**
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>AnganwadiHrms records your location at check-in / check-out.</string>
```

**Android — `android/app/src/main/AndroidManifest.xml`** (inside `<manifest>`):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

The runtime prompt for Android is requested in `src/api/location.ts`.

## Run

```bash
# In one terminal — Metro bundler
npm start

# In another — pick one
npm run ios       # iOS simulator
npm run android   # Android emulator / device
```

## Backend URL

Set `API_BASE_URL` (see `.env.example`). Defaults:

| target              | URL                          |
|---------------------|------------------------------|
| iOS simulator       | `http://localhost:8080`      |
| Android emulator    | `http://10.0.2.2:8080`       |
| Physical device     | `http://<your-LAN-ip>:8080`  |

> Android cleartext: by default, RN Android disallows cleartext HTTP. For local
> dev against a non-HTTPS backend, set `android:usesCleartextTraffic="true"`
> on `<application>` in `AndroidManifest.xml`, or use a proper TLS endpoint in
> production.

## App flow

`App.tsx` reads the persisted JWT from `AsyncStorage` and starts at either
`Login` or `Home`. The root stack:

| Screen      | Route key  | What it does                                                   |
|-------------|------------|----------------------------------------------------------------|
| Login       | `Login`    | `POST /auth/login` → JWT → AsyncStorage                        |
| Home        | `Home`     | Buttons to other screens; sign-out clears AsyncStorage         |
| Profile     | `Profile`  | `GET /me`; phone editable, name/email/hourly_rate read-only    |
| Check in    | `CheckIn`  | Requests GPS, `POST /attendance/checkin {lat, lng}`            |
| Check out   | `CheckOut` | Requests GPS, `POST /attendance/checkout {lat, lng}`           |
| Payslip     | `Payslip`  | `GET /payslip?month=YYYY-MM`, shows totals + paid status       |

## Project layout

```
App.tsx                      root stack + auth gate
index.js                     RN entry
src/
  api/
    client.ts                fetch + JWT + AsyncStorage
    location.ts              cross-platform GPS w/ Android permission
  navigation/types.ts        param list types
  screens/
    LoginScreen.tsx
    HomeScreen.tsx
    ProfileScreen.tsx
    CheckInScreen.tsx
    CheckOutScreen.tsx
    PayslipScreen.tsx
```

## Tests

The mobile project ships with `jest` configured by `react-native`'s default
preset. Run `npm test` once dependencies are installed. (Backend has the
authoritative JUnit test suite for the salary rule and JWT auth flow.)
