# 🚀 Quick Start Guide

Get the Travel Companion app running in 5 minutes!

## 1. Prerequisites Check

```bash
# Check Flutter installation
flutter doctor

# Should show:
# ✓ Flutter
# ✓ Android toolchain
# ✓ Xcode (macOS only)
# ✓ VS Code or Android Studio
```

## 2. Clone & Install

```bash
# Clone the repository
git clone <repo-url>
cd travel-companion

# Install dependencies
flutter pub get
```

## 3. Get API Keys (Fast Track)

### Quick Setup (For Testing)
Create `.env` file with placeholder keys:

```env
GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
OPENAI_API_KEY=YOUR_KEY_HERE
OPENWEATHER_API_KEY=YOUR_KEY_HERE
CURRENCY_API_KEY=YOUR_KEY_HERE
```

### Get Real Keys:

1. **Google Maps** (2 minutes)
   - Visit: https://console.cloud.google.com/
   - Enable: Maps SDK, Places API
   - Copy API key

2. **OpenAI** (2 minutes)
   - Visit: https://platform.openai.com/api-keys
   - Create new key
   - Copy key

3. **OpenWeather** (1 minute)
   - Visit: https://openweathermap.org/api
   - Sign up
   - Copy API key

## 4. Run the App

```bash
# Start an emulator or connect a device
flutter devices

# Run the app
flutter run
```

That's it! 🎉

## What You Can Do Now

### Without API Keys (Local Features)
✅ Create trips manually  
✅ Add expenses  
✅ View budget summary  
✅ Explore UI

### With API Keys (Full Features)
✅ All above, plus:  
✅ AI itinerary generation  
✅ Weather forecasts  
✅ AI chat assistant  
✅ Place search  
✅ Currency conversion  
✅ Maps (requires Maps API key)

## Test the App

### 1. Create Your First Trip

1. Tap "New Trip" on home screen
2. Fill in:
   - Name: "Paris Vacation"
   - Destination: "Paris, France"
   - Dates: Next week (7 days)
   - Budget: 2000 USD
3. Select interests: Food, Art, Culture
4. Tap "Create Trip"
5. Choose "Generate Itinerary" (if you have OpenAI key)

### 2. Try AI Chat

1. Tap "AI Assistant"
2. Ask: "What are the best restaurants in Paris?"
3. Get AI-powered recommendations!

### 3. Add Expenses

1. Open your trip
2. Go to "Budget" tab
3. Tap "+" button
4. Add an expense:
   - Amount: 50
   - Category: Food & Dining
   - Description: "Lunch at café"
5. See budget update in real-time

### 4. Explore Map (Placeholder)

1. Tap "Explore" or "Map"
2. See map interface (integrate Google Maps in production)

## Common Commands

```bash
# Clean build
flutter clean && flutter pub get

# Run with API keys
flutter run --dart-define=OPENAI_API_KEY=sk-xxx

# Build release APK
flutter build apk --release

# Run tests
flutter test

# Generate code
flutter pub run build_runner build --delete-conflicting-outputs

# Check for updates
flutter pub outdated
```

## Troubleshooting Quick Fixes

### "No devices found"
```bash
# Android
# Open Android Studio → AVD Manager → Start emulator

# iOS (macOS)
open -a Simulator
```

### "Build failed"
```bash
flutter clean
flutter pub get
flutter run
```

### "API key errors"
- Check `.env` file exists
- Verify keys are correct (no quotes)
- Restart app

## Next Steps

1. ✅ App running? Great!
2. 📖 Read [SETUP.md](SETUP.md) for detailed configuration
3. 🔧 Read [TECHNICAL_DOCS.md](TECHNICAL_DOCS.md) to understand the code
4. 🎨 Customize themes in `lib/core/theme/app_theme.dart`
5. 🗺️ Integrate Google Maps (see SETUP.md)
6. 🚀 Deploy to Play Store / App Store

## Need Help?

- 📖 Check [README.md](README.md)
- 📚 Read [SETUP.md](SETUP.md)
- 🔍 Search issues on GitHub
- 💬 Ask in discussions

## Demo Credentials

For testing Firebase features (when implemented):

```
Email: demo@travelcompanion.app
Password: demo123456
```

---

**Happy coding! 🌍✈️**
