# Travel Companion - The Last Travel App You'll Ever Need

An all-in-one intelligent travel platform that consolidates every travel need into a single app.

## 🌟 Features

### Core Features
- **All-in-One Itinerary & Booking**: Integrate flights, hotels, rental cars, tours, and user-provided plans
- **Smart AI Itinerary Planner**: Generate personalized multi-day travel plans using GPT-4
- **Route Optimization**: TSP-based algorithms to optimize daily travel routes
- **Offline Maps & Navigation**: Full offline functionality with cached maps and routing
- **Expense & Budget Tracker**: Real-time budget tracking with multi-currency support
- **Local Discovery**: Find restaurants, attractions, events with AI recommendations
- **Personal AI Assistant**: Conversational chat for on-the-fly travel help
- **Weather & Travel Alerts**: Real-time weather and flight/booking updates
- **Travel Utilities**: Currency converter, translator, emergency contacts, travel guides

### Technical Highlights
- **Cross-platform**: Built with Flutter for iOS and Android
- **Offline-first**: Works completely without internet connection
- **AI-powered**: GPT-4 integration for smart planning and assistance
- **Clean Architecture**: Modular, maintainable codebase
- **State Management**: Riverpod for scalable state handling
- **Secure**: GDPR/CCPA compliant with secure data handling

## 🏗️ Architecture

```
lib/
├── core/              # Shared utilities, constants, themes
├── data/              # Data sources, repositories, models
├── domain/            # Business logic, entities, use cases
├── presentation/      # UI screens, widgets, state management
└── main.dart          # App entry point
```

### Tech Stack
- **Frontend**: Flutter (Dart)
- **State Management**: Riverpod
- **Local Database**: SQLite + Hive
- **Maps**: Google Maps / Mapbox with offline support
- **AI**: OpenAI GPT-4 API
- **Backend**: Firebase (Auth, Firestore, Storage)
- **APIs**: Google Places, OpenWeather, Currency conversion

## 🚀 Getting Started

### Prerequisites
- Flutter SDK (3.0.0+)
- Firebase account
- API Keys for:
  - Google Maps Platform
  - OpenAI API
  - OpenWeather
  - Currency API (optional)

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/travel-companion.git
cd travel-companion
```

2. Install dependencies
```bash
flutter pub get
```

3. Configure API keys
Create `.env` file in the root directory:
```
GOOGLE_MAPS_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
OPENWEATHER_API_KEY=your_key_here
CURRENCY_API_KEY=your_key_here
```

4. Run build_runner for code generation
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

5. Run the app
```bash
flutter run
```

## 📱 Features in Detail

### Offline Functionality
- Pre-download map tiles for destination regions
- Cache all itinerary data locally with SQLite
- Offline route planning with OSRM/GraphHopper
- Background sync when connection is restored

### AI-Powered Planning
- Natural language trip requests
- Personalized based on user preferences
- Semantic search for attractions
- Real-time chat assistance

### Budget Management
- Set budget per trip or category
- Multi-currency support with live conversion
- Expense tracking with receipt OCR
- Visual dashboards and spending alerts

### Route Optimization
- Traveling Salesman Problem solver
- Minimize travel time between attractions
- Smart day planning with time constraints
- Real-time traffic integration (when online)

## 🔒 Privacy & Security

- GDPR/CCPA compliant
- End-to-end encryption for sensitive data
- OAuth2 authentication
- Secure API key management
- No data selling or third-party sharing
- User data export/deletion on request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- Google Maps Platform
- OpenStreetMap community
- Flutter team and community
