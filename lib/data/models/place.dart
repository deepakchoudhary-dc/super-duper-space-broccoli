// Place model from Google Places / Yelp / local cache.

class Place {
  final String id;
  final String name;
  final String? description;
  final double latitude;
  final double longitude;
  final String? address;
  final String? phoneNumber;
  final String? website;
  final double? rating;
  final int? userRatingsTotal;
  final List<String> types;
  final String? priceLevel;
  final List<String> photos;
  final bool? openNow;
  final List<PlaceReview> reviews;

  const Place({
    required this.id,
    required this.name,
    this.description,
    required this.latitude,
    required this.longitude,
    this.address,
    this.phoneNumber,
    this.website,
    this.rating,
    this.userRatingsTotal,
    this.types = const [],
    this.priceLevel,
    this.photos = const [],
    this.openNow,
    this.reviews = const [],
  });

  factory Place.fromGoogleJson(Map<String, dynamic> j) {
    final geo = j['geometry'] as Map<String, dynamic>?;
    final loc = geo?['location'] as Map<String, dynamic>?;
    return Place(
      id: j['place_id'] as String? ?? '',
      name: j['name'] as String? ?? '',
      description: (j['editorial_summary']
          as Map<String, dynamic>?)?['overview'] as String?,
      latitude: (loc?['lat'] as num?)?.toDouble() ?? 0,
      longitude: (loc?['lng'] as num?)?.toDouble() ?? 0,
      address: j['formatted_address'] as String? ?? j['vicinity'] as String?,
      phoneNumber: j['formatted_phone_number'] as String?,
      website: j['website'] as String?,
      rating: (j['rating'] as num?)?.toDouble(),
      userRatingsTotal: j['user_ratings_total'] as int?,
      types: List<String>.from(j['types'] ?? []),
      priceLevel: j['price_level']?.toString(),
      photos: (j['photos'] as List?)
              ?.map((p) => p['photo_reference'] as String)
              .toList() ??
          [],
      openNow: (j['opening_hours']
          as Map<String, dynamic>?)?['open_now'] as bool?,
      reviews: (j['reviews'] as List?)
              ?.map((r) =>
                  PlaceReview.fromJson(r as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  factory Place.fromJson(Map<String, dynamic> j) => Place(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String?,
        latitude: (j['latitude'] as num).toDouble(),
        longitude: (j['longitude'] as num).toDouble(),
        address: j['address'] as String?,
        phoneNumber: j['phoneNumber'] as String?,
        website: j['website'] as String?,
        rating: (j['rating'] as num?)?.toDouble(),
        userRatingsTotal: j['userRatingsTotal'] as int?,
        types: List<String>.from(j['types'] ?? []),
        priceLevel: j['priceLevel'] as String?,
        photos: List<String>.from(j['photos'] ?? []),
        openNow: j['openNow'] as bool?,
        reviews: (j['reviews'] as List?)
                ?.map((r) =>
                    PlaceReview.fromJson(r as Map<String, dynamic>))
                .toList() ??
            [],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        'phoneNumber': phoneNumber,
        'website': website,
        'rating': rating,
        'userRatingsTotal': userRatingsTotal,
        'types': types,
        'priceLevel': priceLevel,
        'photos': photos,
        'openNow': openNow,
        'reviews': reviews.map((r) => r.toJson()).toList(),
      };
}

class PlaceReview {
  final String author;
  final double rating;
  final String text;
  final String time;

  const PlaceReview({
    required this.author,
    required this.rating,
    required this.text,
    required this.time,
  });

  factory PlaceReview.fromJson(Map<String, dynamic> j) => PlaceReview(
        author: j['author_name'] as String? ?? j['author'] as String? ?? '',
        rating: (j['rating'] as num).toDouble(),
        text: j['text'] as String? ?? '',
        time: j['relative_time_description'] as String? ??
            j['time'] as String? ??
            '',
      );

  Map<String, dynamic> toJson() => {
        'author': author,
        'rating': rating,
        'text': text,
        'time': time,
      };
}
