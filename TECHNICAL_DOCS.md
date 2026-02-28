# 🗺️ Travel Companion - Technical Documentation

## Architecture Overview

The Travel Companion app follows **Clean Architecture** principles with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (UI, Screens, Widgets, Providers)      │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│          Domain Layer (Optional)        │
│      (Business Logic, Use Cases)        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│            Data Layer                   │
│  (Models, Repositories, Services)       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         External Services               │
│  (APIs, Database, Cloud Storage)        │
└─────────────────────────────────────────┘
```

## Core Technologies

### State Management
- **Riverpod**: For reactive state management
- **StateNotifier**: For complex state handling
- **Provider**: For dependency injection

### Data Persistence
- **SQLite (sqflite)**: Local database for trips and expenses
- **Hive**: Fast key-value storage for user preferences
- **Shared Preferences**: Simple key-value pairs

### APIs & Services
- **OpenAI GPT-4**: AI-powered itinerary generation and chat
- **Google Maps/Places API**: Maps, places, and geocoding
- **OpenWeather API**: Weather forecasts
- **Exchange Rate API**: Currency conversion

### Navigation
- **GoRouter**: Declarative routing with deep linking support

### UI
- **Material 3**: Modern Material Design
- **Google Fonts**: Custom typography
- **FL Chart**: Data visualization

## Key Features Implementation

### 1. AI-Powered Itinerary Planning

**How it works:**
1. User creates trip with destination, dates, and preferences
2. AI service (`AiService`) sends request to GPT-4 with context:
   - Destination
   - Duration
   - Travel style (budget/moderate/luxury)
   - Interests
3. GPT-4 returns detailed day-by-day itinerary
4. `TripRepository` enriches with real data:
   - Searches Google Places for actual locations
   - Fetches weather forecasts
   - Optimizes route using TSP algorithm
5. Saves to local database for offline access

**Code Flow:**
```
CreateTripScreen → TripsNotifier.createTrip()
                → TripsNotifier.generateItinerary()
                → TripRepository.generateItinerary()
                → AiService.generateItinerary()
                → PlacesService.searchNearby()
                → WeatherService.getForecast()
                → RouteOptimizerService.optimizeRoute()
                → DatabaseService.insertTrip()
```

### 2. Route Optimization (TSP)

**Algorithm:** Nearest Neighbor + 2-Opt Improvement

The `RouteOptimizerService` implements:

1. **Nearest Neighbor Heuristic**:
   - Start at first location
   - Always visit nearest unvisited location
   - O(n²) time complexity

2. **2-Opt Improvement**:
   - Try swapping edges to reduce total distance
   - Iterate until no improvement found
   - Local optimization

**Distance Calculation:**
Uses Haversine formula for great-circle distance between coordinates:

```dart
distance = 2 * R * arcsin(sqrt(sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)))
```

### 3. Offline Functionality

**Strategy:** Offline-first with background sync

**What's cached:**
- All trip data (SQLite)
- User preferences (Hive)
- Map tiles (via map SDK offline manager)
- Place information (cached_places table)
- Weather forecasts (embedded in day plans)

**Sync Process:**
1. Monitor connectivity with `ConnectivityPlus`
2. Mark local changes with `isSynced = false`
3. When online, `OfflineService.syncToServer()`:
   - Upload unsynced data
   - Download server updates
   - Resolve conflicts (last-write-wins)
4. Update `isSynced = true`

### 4. Budget Tracking

**Features:**
- Real-time expense tracking
- Category-based spending analysis
- Budget warnings (80% threshold)
- Multi-currency support with conversion
- Visual charts (pie charts, bar charts)

**Data Flow:**
```
BudgetScreen → ExpensesNotifier.addExpense()
            → ExpenseRepository.createExpense()
            → DatabaseService.insertExpense()
            → BudgetSummaryProvider recalculates
```

**Budget Summary Calculation:**
```dart
totalSpent = sum(all expenses)
remaining = budget - totalSpent
percentageUsed = (totalSpent / budget) * 100
isOverBudget = remaining < 0
isNearLimit = percentageUsed > 80
```

### 5. AI Chat Assistant

**Context-Aware Responses:**

The chat assistant includes:
- User's current location
- Active trip details
- Travel preferences
- Weather conditions
- Nearby places

**Prompt Engineering:**
```
System: You are a travel assistant...
Context:
- Location: Paris, France
- Date: 2026-03-15
- Preferences: Food, Art
- Weather: 18°C, Sunny

User: Where should I eat dinner?
```

### 6. Weather Integration

**Data Sources:**
- OpenWeather API (5-day forecast)
- Embedded in day plans
- Used for activity suggestions

**Smart Suggestions:**
- Rain → Indoor activities (museums, shopping)
- Good weather → Outdoor activities (parks, sightseeing)
- Extreme temps → Climate-controlled venues

## Database Schema

### Trips Table
```sql
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  budget REAL NOT NULL,
  currency TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON blob
  is_synced INTEGER DEFAULT 0
)
```

### Expenses Table
```sql
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  date INTEGER NOT NULL,
  is_synced INTEGER DEFAULT 0,
  FOREIGN KEY (trip_id) REFERENCES trips(id)
)
```

### Cached Places Table
```sql
CREATE TABLE cached_places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  data TEXT NOT NULL,
  cached_at INTEGER NOT NULL
)
```

## State Management Details

### Providers Hierarchy

```
ServiceProviders (Singleton)
  ├── AiService
  ├── PlacesService
  ├── WeatherService
  └── RouteOptimizerService
  
RepositoryProviders (Singleton)
  ├── TripRepository (uses services)
  └── ExpenseRepository
  
StateProviders
  ├── currentUserProvider
  ├── currentTripProvider
  ├── isOfflineProvider
  
StateNotifierProviders
  ├── tripsProvider (TripsNotifier)
  ├── expensesProvider.family (ExpensesNotifier)
  └── chatMessagesProvider (ChatMessagesNotifier)
  
FutureProviders
  └── budgetSummaryProvider.family
```

### Data Flow Pattern

```
UI Widget → Read Provider → StateNotifier
                              ↓
                          Repository
                              ↓
                          Service/API
                              ↓
                          Database
                              ↓
                    Update State (AsyncValue)
                              ↓
                      Rebuild Widget
```

## Security & Privacy

### Data Protection
- API keys stored in environment variables (never in code)
- Local database encrypted (optional, via sqflite_sqlcipher)
- Secure HTTPS for all API calls
- No sensitive data in logs

### GDPR Compliance
- Explicit consent for location data
- Privacy policy displayed on first launch
- Data export functionality
- Account deletion with data removal
- Minimal data collection

### API Key Security
```dart
// ❌ Never do this:
const apiKey = "sk-abc123...";

// ✅ Do this:
const apiKey = String.fromEnvironment('OPENAI_API_KEY');
```

## Performance Optimizations

### 1. Lazy Loading
- Use `ListView.builder` for long lists
- Load trip details on-demand
- Paginate API results

### 2. Caching
- Cache API responses (1 hour for weather, 24h for places)
- Prefetch nearby places when trip is created
- Store processed data (optimized routes)

### 3. Background Processing
- Use WorkManager for sync in background
- Compute-intensive tasks in isolates
- Debounce search inputs

### 4. Image Optimization
- Use `CachedNetworkImage` for remote images
- Compress uploaded images
- Use vector graphics (SVG) for icons

## Testing Strategy

### Unit Tests
```dart
test('Route optimizer minimizes distance', () {
  final optimizer = RouteOptimizerService();
  final activities = [/* ... */];
  final optimized = await optimizer.optimizeRoute(activities);
  expect(calculateDistance(optimized), lessThan(calculateDistance(activities)));
});
```

### Widget Tests
```dart
testWidgets('Create trip form validation', (tester) async {
  await tester.pumpWidget(CreateTripScreen());
  await tester.tap(find.text('Create Trip'));
  expect(find.text('Please enter a trip name'), findsOneWidget);
});
```

### Integration Tests
```dart
testWidgets('End-to-end trip creation', (tester) async {
  // Create trip → Generate itinerary → View details
});
```

## Deployment

### Android
```bash
flutter build apk --release
flutter build appbundle --release  # For Play Store
```

### iOS
```bash
flutter build ipa --release
```

### Web (Optional)
```bash
flutter build web --release
```

## Monitoring & Analytics

### Recommended Tools
- **Firebase Analytics**: User behavior tracking
- **Crashlytics**: Crash reporting
- **Sentry**: Error tracking
- **Firebase Performance**: Performance monitoring

### Key Metrics
- Trip creation rate
- AI itinerary generation success rate
- Offline usage percentage
- Average trip budget
- Popular destinations

## Future Enhancements

### Phase 2
- [ ] Social features (share trips, collaborate)
- [ ] Group trip planning
- [ ] Real-time collaboration
- [ ] Flight/hotel booking integration
- [ ] Receipt scanning (OCR)
- [ ] Voice commands
- [ ] AR navigation

### Phase 3
- [ ] Wearable support (Apple Watch, Wear OS)
- [ ] Desktop app (Windows, macOS, Linux)
- [ ] Chrome extension
- [ ] Travel agency dashboard
- [ ] Premium features (subscription model)

## Troubleshooting

### Common Issues

**Issue: Map not loading**
- Solution: Check API key, ensure Maps SDK enabled, verify internet connection

**Issue: AI responses slow**
- Solution: Implement streaming responses, show loading indicators, cache common queries

**Issue: High battery usage**
- Solution: Reduce location update frequency, use geofencing, optimize background sync

**Issue: App crashes on low-end devices**
- Solution: Reduce image sizes, limit cached data, optimize list rendering

## Contributing

See CONTRIBUTING.md for development guidelines.

## License

MIT License - See LICENSE file
