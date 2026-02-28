// Everything that describes a trip and its itinerary.
// All (de)serialisation is hand-written — no code-gen required.

// ── Enums ─────────────────────────────────────────────────────────────

enum ActivityType {
  attraction,
  restaurant,
  accommodation,
  transportation,
  shopping,
  entertainment,
  museum,
  nature,
  nightlife,
  medical,
  other,
}

// ── WeatherInfo ─────────────────────────────────────────────────────────

class WeatherInfo {
  final DateTime date;
  final double temperature;
  final double feelsLike;
  final String condition;   // e.g. "Rain"
  final String description; // e.g. "heavy rain"
  final int humidity;
  final double windSpeed;
  final String icon;

  const WeatherInfo({
    required this.date,
    required this.temperature,
    required this.feelsLike,
    required this.condition,
    required this.description,
    required this.humidity,
    required this.windSpeed,
    required this.icon,
  });

  bool get isGoodForOutdoor {
    const bad = ['Rain', 'Thunderstorm', 'Snow', 'Drizzle'];
    return !bad.contains(condition) && temperature > 10 && temperature < 35;
  }

  factory WeatherInfo.fromJson(Map<String, dynamic> j) => WeatherInfo(
        date: DateTime.parse(j['date'] as String),
        temperature: (j['temperature'] as num).toDouble(),
        feelsLike: (j['feelsLike'] as num).toDouble(),
        condition: j['condition'] as String,
        description: j['description'] as String,
        humidity: j['humidity'] as int,
        windSpeed: (j['windSpeed'] as num).toDouble(),
        icon: j['icon'] as String,
      );

  Map<String, dynamic> toJson() => {
        'date': date.toIso8601String(),
        'temperature': temperature,
        'feelsLike': feelsLike,
        'condition': condition,
        'description': description,
        'humidity': humidity,
        'windSpeed': windSpeed,
        'icon': icon,
      };
}

// ── TripPreferences ────────────────────────────────────────────────────

class TripPreferences {
  final String travelStyle; // budget | moderate | luxury
  final List<String> interests;
  final String travelPace;  // relaxed | moderate | packed
  final bool familyFriendly;

  const TripPreferences({
    this.travelStyle = 'moderate',
    this.interests = const [],
    this.travelPace = 'moderate',
    this.familyFriendly = false,
  });

  factory TripPreferences.fromJson(Map<String, dynamic> j) => TripPreferences(
        travelStyle: j['travelStyle'] as String? ?? 'moderate',
        interests: List<String>.from(j['interests'] ?? []),
        travelPace: j['travelPace'] as String? ?? 'moderate',
        familyFriendly: j['familyFriendly'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'travelStyle': travelStyle,
        'interests': interests,
        'travelPace': travelPace,
        'familyFriendly': familyFriendly,
      };
}

// ── Activity ────────────────────────────────────────────────────────────

class Activity {
  final String id;
  final String name;
  final String? description;
  final double latitude;
  final double longitude;
  final String? address;
  final DateTime? startTime;
  final DateTime? endTime;
  final double? estimatedCost;
  final ActivityType type;
  final String? placeId;
  final String? imageUrl;
  final double? rating;
  final String? phoneNumber;
  final String? website;
  final List<String> tags;
  final bool isBooked;
  final String? bookingReference;

  const Activity({
    required this.id,
    required this.name,
    this.description,
    required this.latitude,
    required this.longitude,
    this.address,
    this.startTime,
    this.endTime,
    this.estimatedCost,
    this.type = ActivityType.attraction,
    this.placeId,
    this.imageUrl,
    this.rating,
    this.phoneNumber,
    this.website,
    this.tags = const [],
    this.isBooked = false,
    this.bookingReference,
  });

  Activity copyWith({
    String? id,
    String? name,
    String? description,
    double? latitude,
    double? longitude,
    String? address,
    DateTime? startTime,
    DateTime? endTime,
    double? estimatedCost,
    ActivityType? type,
    String? placeId,
    String? imageUrl,
    double? rating,
    String? phoneNumber,
    String? website,
    List<String>? tags,
    bool? isBooked,
    String? bookingReference,
  }) =>
      Activity(
        id: id ?? this.id,
        name: name ?? this.name,
        description: description ?? this.description,
        latitude: latitude ?? this.latitude,
        longitude: longitude ?? this.longitude,
        address: address ?? this.address,
        startTime: startTime ?? this.startTime,
        endTime: endTime ?? this.endTime,
        estimatedCost: estimatedCost ?? this.estimatedCost,
        type: type ?? this.type,
        placeId: placeId ?? this.placeId,
        imageUrl: imageUrl ?? this.imageUrl,
        rating: rating ?? this.rating,
        phoneNumber: phoneNumber ?? this.phoneNumber,
        website: website ?? this.website,
        tags: tags ?? this.tags,
        isBooked: isBooked ?? this.isBooked,
        bookingReference: bookingReference ?? this.bookingReference,
      );

  factory Activity.fromJson(Map<String, dynamic> j) => Activity(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String?,
        latitude: (j['latitude'] as num).toDouble(),
        longitude: (j['longitude'] as num).toDouble(),
        address: j['address'] as String?,
        startTime: j['startTime'] != null
            ? DateTime.parse(j['startTime'] as String)
            : null,
        endTime: j['endTime'] != null
            ? DateTime.parse(j['endTime'] as String)
            : null,
        estimatedCost: (j['estimatedCost'] as num?)?.toDouble(),
        type: ActivityType.values.firstWhere(
          (e) => e.name == j['type'],
          orElse: () => ActivityType.attraction,
        ),
        placeId: j['placeId'] as String?,
        imageUrl: j['imageUrl'] as String?,
        rating: (j['rating'] as num?)?.toDouble(),
        phoneNumber: j['phoneNumber'] as String?,
        website: j['website'] as String?,
        tags: List<String>.from(j['tags'] ?? []),
        isBooked: j['isBooked'] as bool? ?? false,
        bookingReference: j['bookingReference'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        'startTime': startTime?.toIso8601String(),
        'endTime': endTime?.toIso8601String(),
        'estimatedCost': estimatedCost,
        'type': type.name,
        'placeId': placeId,
        'imageUrl': imageUrl,
        'rating': rating,
        'phoneNumber': phoneNumber,
        'website': website,
        'tags': tags,
        'isBooked': isBooked,
        'bookingReference': bookingReference,
      };
}

// ── DayPlan ─────────────────────────────────────────────────────────────

class DayPlan {
  final int dayNumber;
  final DateTime date;
  final List<Activity> activities;
  final String? notes;
  final WeatherInfo? weather;

  const DayPlan({
    required this.dayNumber,
    required this.date,
    this.activities = const [],
    this.notes,
    this.weather,
  });

  DayPlan copyWith({
    int? dayNumber,
    DateTime? date,
    List<Activity>? activities,
    String? notes,
    WeatherInfo? weather,
  }) =>
      DayPlan(
        dayNumber: dayNumber ?? this.dayNumber,
        date: date ?? this.date,
        activities: activities ?? this.activities,
        notes: notes ?? this.notes,
        weather: weather ?? this.weather,
      );

  factory DayPlan.fromJson(Map<String, dynamic> j) => DayPlan(
        dayNumber: j['dayNumber'] as int,
        date: DateTime.parse(j['date'] as String),
        activities: (j['activities'] as List<dynamic>?)
                ?.map((a) => Activity.fromJson(a as Map<String, dynamic>))
                .toList() ??
            [],
        notes: j['notes'] as String?,
        weather: j['weather'] != null
            ? WeatherInfo.fromJson(j['weather'] as Map<String, dynamic>)
            : null,
      );

  Map<String, dynamic> toJson() => {
        'dayNumber': dayNumber,
        'date': date.toIso8601String(),
        'activities': activities.map((a) => a.toJson()).toList(),
        'notes': notes,
        'weather': weather?.toJson(),
      };
}

// ── Trip ────────────────────────────────────────────────────────────────

class Trip {
  final String id;
  final String name;
  final String destination;
  final DateTime startDate;
  final DateTime endDate;
  final double budget;
  final String currency;
  final List<DayPlan> dayPlans;
  final String? imageUrl;
  final String? description;
  final List<String> tags;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isSynced;
  final TripPreferences? preferences;
  final List<String> collaborators;

  Trip({
    required this.id,
    required this.name,
    required this.destination,
    required this.startDate,
    required this.endDate,
    required this.budget,
    this.currency = 'USD',
    this.dayPlans = const [],
    this.imageUrl,
    this.description,
    this.tags = const [],
    required this.createdAt,
    required this.updatedAt,
    this.isSynced = false,
    this.preferences,
    this.collaborators = const [],
  });

  int get durationDays => endDate.difference(startDate).inDays + 1;

  bool get isOngoing {
    final now = DateTime.now();
    return now.isAfter(startDate) && now.isBefore(endDate.add(const Duration(days: 1)));
  }

  bool get isUpcoming => startDate.isAfter(DateTime.now());
  bool get isPast => endDate.isBefore(DateTime.now());

  Trip copyWith({
    String? id,
    String? name,
    String? destination,
    DateTime? startDate,
    DateTime? endDate,
    double? budget,
    String? currency,
    List<DayPlan>? dayPlans,
    String? imageUrl,
    String? description,
    List<String>? tags,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? isSynced,
    TripPreferences? preferences,
    List<String>? collaborators,
  }) =>
      Trip(
        id: id ?? this.id,
        name: name ?? this.name,
        destination: destination ?? this.destination,
        startDate: startDate ?? this.startDate,
        endDate: endDate ?? this.endDate,
        budget: budget ?? this.budget,
        currency: currency ?? this.currency,
        dayPlans: dayPlans ?? this.dayPlans,
        imageUrl: imageUrl ?? this.imageUrl,
        description: description ?? this.description,
        tags: tags ?? this.tags,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        isSynced: isSynced ?? this.isSynced,
        preferences: preferences ?? this.preferences,
        collaborators: collaborators ?? this.collaborators,
      );

  factory Trip.fromJson(Map<String, dynamic> j) => Trip(
        id: j['id'] as String,
        name: j['name'] as String,
        destination: j['destination'] as String,
        startDate: DateTime.parse(j['startDate'] as String),
        endDate: DateTime.parse(j['endDate'] as String),
        budget: (j['budget'] as num).toDouble(),
        currency: j['currency'] as String? ?? 'USD',
        dayPlans: (j['dayPlans'] as List<dynamic>?)
                ?.map((d) => DayPlan.fromJson(d as Map<String, dynamic>))
                .toList() ??
            [],
        imageUrl: j['imageUrl'] as String?,
        description: j['description'] as String?,
        tags: List<String>.from(j['tags'] ?? []),
        createdAt: DateTime.parse(j['createdAt'] as String),
        updatedAt: DateTime.parse(j['updatedAt'] as String),
        isSynced: j['isSynced'] as bool? ?? false,
        preferences: j['preferences'] != null
            ? TripPreferences.fromJson(
                j['preferences'] as Map<String, dynamic>)
            : null,
        collaborators: List<String>.from(j['collaborators'] ?? []),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'destination': destination,
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
        'budget': budget,
        'currency': currency,
        'dayPlans': dayPlans.map((d) => d.toJson()).toList(),
        'imageUrl': imageUrl,
        'description': description,
        'tags': tags,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'isSynced': isSynced,
        'preferences': preferences?.toJson(),
        'collaborators': collaborators,
      };
}
