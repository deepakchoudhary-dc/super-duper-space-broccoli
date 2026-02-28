// User profile and preferences.

class UserPreferences {
  final String preferredCurrency;
  final String preferredLanguage;
  final String budgetLevel; // budget | moderate | luxury
  final List<String> interests;
  final String travelPace; // relaxed | moderate | packed
  final bool darkMode;
  final bool notificationsEnabled;
  final bool offlineMapsEnabled;
  final String measurementSystem; // metric | imperial

  const UserPreferences({
    this.preferredCurrency = 'USD',
    this.preferredLanguage = 'en',
    this.budgetLevel = 'moderate',
    this.interests = const [],
    this.travelPace = 'moderate',
    this.darkMode = false,
    this.notificationsEnabled = true,
    this.offlineMapsEnabled = true,
    this.measurementSystem = 'metric',
  });

  UserPreferences copyWith({
    String? preferredCurrency,
    String? preferredLanguage,
    String? budgetLevel,
    List<String>? interests,
    String? travelPace,
    bool? darkMode,
    bool? notificationsEnabled,
    bool? offlineMapsEnabled,
    String? measurementSystem,
  }) =>
      UserPreferences(
        preferredCurrency: preferredCurrency ?? this.preferredCurrency,
        preferredLanguage: preferredLanguage ?? this.preferredLanguage,
        budgetLevel: budgetLevel ?? this.budgetLevel,
        interests: interests ?? this.interests,
        travelPace: travelPace ?? this.travelPace,
        darkMode: darkMode ?? this.darkMode,
        notificationsEnabled:
            notificationsEnabled ?? this.notificationsEnabled,
        offlineMapsEnabled: offlineMapsEnabled ?? this.offlineMapsEnabled,
        measurementSystem: measurementSystem ?? this.measurementSystem,
      );

  factory UserPreferences.fromJson(Map<String, dynamic> j) => UserPreferences(
        preferredCurrency: j['preferredCurrency'] as String? ?? 'USD',
        preferredLanguage: j['preferredLanguage'] as String? ?? 'en',
        budgetLevel: j['budgetLevel'] as String? ?? 'moderate',
        interests: List<String>.from(j['interests'] ?? []),
        travelPace: j['travelPace'] as String? ?? 'moderate',
        darkMode: j['darkMode'] as bool? ?? false,
        notificationsEnabled: j['notificationsEnabled'] as bool? ?? true,
        offlineMapsEnabled: j['offlineMapsEnabled'] as bool? ?? true,
        measurementSystem: j['measurementSystem'] as String? ?? 'metric',
      );

  Map<String, dynamic> toJson() => {
        'preferredCurrency': preferredCurrency,
        'preferredLanguage': preferredLanguage,
        'budgetLevel': budgetLevel,
        'interests': interests,
        'travelPace': travelPace,
        'darkMode': darkMode,
        'notificationsEnabled': notificationsEnabled,
        'offlineMapsEnabled': offlineMapsEnabled,
        'measurementSystem': measurementSystem,
      };
}

class UserProfile {
  final String id;
  final String email;
  final String? displayName;
  final String? photoUrl;
  final UserPreferences preferences;
  final String? homeLocation;
  final String? phoneNumber;
  final List<String> pastDestinations;
  final DateTime createdAt;
  final DateTime lastUpdated;

  UserProfile({
    required this.id,
    required this.email,
    this.displayName,
    this.photoUrl,
    UserPreferences? preferences,
    this.homeLocation,
    this.phoneNumber,
    this.pastDestinations = const [],
    required this.createdAt,
    required this.lastUpdated,
  }) : preferences = preferences ?? const UserPreferences();

  UserProfile copyWith({
    String? id,
    String? email,
    String? displayName,
    String? photoUrl,
    UserPreferences? preferences,
    String? homeLocation,
    String? phoneNumber,
    List<String>? pastDestinations,
    DateTime? createdAt,
    DateTime? lastUpdated,
  }) =>
      UserProfile(
        id: id ?? this.id,
        email: email ?? this.email,
        displayName: displayName ?? this.displayName,
        photoUrl: photoUrl ?? this.photoUrl,
        preferences: preferences ?? this.preferences,
        homeLocation: homeLocation ?? this.homeLocation,
        phoneNumber: phoneNumber ?? this.phoneNumber,
        pastDestinations: pastDestinations ?? this.pastDestinations,
        createdAt: createdAt ?? this.createdAt,
        lastUpdated: lastUpdated ?? this.lastUpdated,
      );

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: j['id'] as String,
        email: j['email'] as String,
        displayName: j['displayName'] as String?,
        photoUrl: j['photoUrl'] as String?,
        preferences: j['preferences'] != null
            ? UserPreferences.fromJson(
                j['preferences'] as Map<String, dynamic>)
            : null,
        homeLocation: j['homeLocation'] as String?,
        phoneNumber: j['phoneNumber'] as String?,
        pastDestinations: List<String>.from(j['pastDestinations'] ?? []),
        createdAt: DateTime.parse(j['createdAt'] as String),
        lastUpdated: DateTime.parse(j['lastUpdated'] as String),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'displayName': displayName,
        'photoUrl': photoUrl,
        'preferences': preferences.toJson(),
        'homeLocation': homeLocation,
        'phoneNumber': phoneNumber,
        'pastDestinations': pastDestinations,
        'createdAt': createdAt.toIso8601String(),
        'lastUpdated': lastUpdated.toIso8601String(),
      };
}
