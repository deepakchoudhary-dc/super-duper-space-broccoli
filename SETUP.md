# 🌍 Travel Companion - Setup Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- **Flutter SDK** (3.0.0 or higher)
  ```bash
  flutter --version
  ```

- **Dart SDK** (included with Flutter)

- **Android Studio** or **Xcode** (for mobile development)

- **Git**

## API Keys Required

This app integrates with several third-party services. You'll need to obtain API keys for:

### 1. Google Maps Platform
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project
- Enable the following APIs:
  - Maps SDK for Android
  - Maps SDK for iOS
  - **Maps JavaScript API** (required for Flutter Web)
  - Places API
  - Geocoding API
  - Distance Matrix API
- Create credentials (API Key)
- Restrict the key appropriately
- For web: replace `YOUR_GOOGLE_MAPS_API_KEY` in `web/index.html` with your actual key

### 2. OpenAI API
- Visit [OpenAI Platform](https://platform.openai.com/)
- Create an account
- Navigate to API Keys
- Generate a new API key

### 3. OpenWeather API
- Go to [OpenWeatherMap](https://openweathermap.org/api)
- Sign up for a free account
- Get your API key from the dashboard

### 4. Currency Exchange API (Optional)
- Use [Exchange Rate API](https://www.exchangerate-api.com/)
- Free tier available

## Installation Steps

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd travel-companion
```

### 2. Install Dependencies
```bash
flutter pub get
```

### 3. Configure API Keys

Create a `.env` file in the root directory:

```env
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
OPENAI_API_KEY=your_openai_key_here
OPENWEATHER_API_KEY=your_openweather_key_here
CURRENCY_API_KEY=your_currency_key_here
```

**Important:** Never commit the `.env` file to version control!

### 4. Configure Firebase (Optional but Recommended)

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)

2. Add Android app:
   ```bash
   # Download google-services.json and place it in android/app/
   ```

3. Add iOS app:
   ```bash
   # Download GoogleService-Info.plist and place it in ios/Runner/
   ```

4. Enable Firebase services:
   - Authentication (Email/Google Sign-in)
   - Firestore Database
   - Cloud Storage

### 5. Generate Code

Run the code generator for JSON serialization and other generated files:

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

### 6. Configure Android

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest>
    <application>
        <!-- Add Google Maps API Key -->
        <meta-data
            android:name="com.google.android.geo.API_KEY"
            android:value="${GOOGLE_MAPS_API_KEY}"/>
    </application>
    
    <!-- Add permissions -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
</manifest>
```

### 7. Configure iOS

Edit `ios/Runner/AppDelegate.swift`:

```swift
import UIKit
import Flutter
import GoogleMaps

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GMSServices.provideAPIKey("YOUR_GOOGLE_MAPS_API_KEY")
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

Edit `ios/Runner/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>This app needs access to location for navigation.</string>
<key>NSLocationAlwaysUsageDescription</key>
<string>This app needs access to location for offline maps.</string>
```

## Running the App

### Development Mode

```bash
# Run on connected device/emulator
flutter run

# Run with API keys from environment
flutter run --dart-define=GOOGLE_MAPS_API_KEY=your_key \
            --dart-define=OPENAI_API_KEY=your_key
```

### Debug Build

```bash
flutter build apk --debug
flutter build ios --debug
```

### Release Build

```bash
# Android
flutter build apk --release

# iOS
flutter build ios --release
```

## Testing

### Run Unit Tests
```bash
flutter test
```

### Run Integration Tests
```bash
flutter test integration_test
```

## Troubleshooting

### Common Issues

1. **"API key not found" errors**
   - Ensure `.env` file is created with all required keys
   - Verify keys are not wrapped in quotes
   - Restart the app after adding keys

2. **Map not displaying**
   - Check Google Maps API key is valid
   - Verify Maps SDK is enabled in Google Cloud Console
   - Check internet connection

3. **Build errors**
   - Run `flutter clean`
   - Delete `pubspec.lock` and run `flutter pub get`
   - Run `flutter pub run build_runner build --delete-conflicting-outputs`

4. **Location permission issues**
   - Check AndroidManifest.xml and Info.plist have location permissions
   - Request permissions at runtime

## Project Structure

```
lib/
├── core/                 # Core utilities, config, theme
├── data/                 # Data layer
│   ├── models/          # Data models
│   ├── repositories/    # Data repositories
│   └── services/        # API services
├── domain/              # Business logic (optional)
├── presentation/        # UI layer
│   ├── providers/       # Riverpod providers
│   ├── screens/         # App screens
│   └── widgets/         # Reusable widgets
└── main.dart            # App entry point
```

## Features Implementation Status

- ✅ Trip creation and management
- ✅ AI-powered itinerary generation
- ✅ Budget tracking and expense management
- ✅ AI chat assistant
- ✅ Route optimization (TSP algorithm)
- ✅ Weather integration
- ✅ Offline database (SQLite)
- 🚧 Google Maps integration (placeholder)
- 🚧 Offline map downloads
- 🚧 Real-time navigation
- 🚧 Social features
- 🚧 Multi-device sync

## Next Steps

1. Replace map placeholders with actual Google Maps/Mapbox implementation
2. Implement Firebase authentication
3. Add real-time sync with Firestore
4. Implement offline map downloads with Mapbox
5. Add social sharing features
6. Integrate booking APIs (optional)
7. Add comprehensive error handling
8. Write more tests
9. Optimize performance
10. Prepare for production deployment

## Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation
- Review the code comments

## License

MIT License - see LICENSE file for details
