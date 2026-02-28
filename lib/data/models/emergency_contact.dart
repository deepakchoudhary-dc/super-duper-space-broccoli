// Emergency information model – country-specific contacts, embassy info, etc.

class EmergencyContact {
  final String country;
  final String countryCode;
  final String police;
  final String ambulance;
  final String fire;
  final String? touristPolice;
  final String? embassy;
  final String? emergencyNotes;

  const EmergencyContact({
    required this.country,
    required this.countryCode,
    required this.police,
    required this.ambulance,
    required this.fire,
    this.touristPolice,
    this.embassy,
    this.emergencyNotes,
  });

  /// Built‑in database of major countries. In production, load from API.
  static const List<EmergencyContact> builtIn = [
    EmergencyContact(
      country: 'United States',
      countryCode: 'US',
      police: '911',
      ambulance: '911',
      fire: '911',
      emergencyNotes: 'Dial 911 for any emergency',
    ),
    EmergencyContact(
      country: 'United Kingdom',
      countryCode: 'GB',
      police: '999',
      ambulance: '999',
      fire: '999',
      emergencyNotes: 'Also 112 for EU standard',
    ),
    EmergencyContact(
      country: 'Japan',
      countryCode: 'JP',
      police: '110',
      ambulance: '119',
      fire: '119',
      touristPolice: '#9110',
      emergencyNotes: 'Tourist hotline: 03-3501-0110',
    ),
    EmergencyContact(
      country: 'France',
      countryCode: 'FR',
      police: '17',
      ambulance: '15',
      fire: '18',
      emergencyNotes: 'EU emergency: 112',
    ),
    EmergencyContact(
      country: 'Germany',
      countryCode: 'DE',
      police: '110',
      ambulance: '112',
      fire: '112',
    ),
    EmergencyContact(
      country: 'Italy',
      countryCode: 'IT',
      police: '113',
      ambulance: '118',
      fire: '115',
      emergencyNotes: 'Carabinieri: 112',
    ),
    EmergencyContact(
      country: 'Spain',
      countryCode: 'ES',
      police: '091',
      ambulance: '061',
      fire: '080',
      emergencyNotes: 'EU emergency: 112',
    ),
    EmergencyContact(
      country: 'Thailand',
      countryCode: 'TH',
      police: '191',
      ambulance: '1669',
      fire: '199',
      touristPolice: '1155',
    ),
    EmergencyContact(
      country: 'Australia',
      countryCode: 'AU',
      police: '000',
      ambulance: '000',
      fire: '000',
    ),
    EmergencyContact(
      country: 'India',
      countryCode: 'IN',
      police: '100',
      ambulance: '108',
      fire: '101',
      emergencyNotes: 'Unified emergency: 112',
    ),
    EmergencyContact(
      country: 'Brazil',
      countryCode: 'BR',
      police: '190',
      ambulance: '192',
      fire: '193',
    ),
    EmergencyContact(
      country: 'Mexico',
      countryCode: 'MX',
      police: '911',
      ambulance: '911',
      fire: '911',
    ),
    EmergencyContact(
      country: 'South Korea',
      countryCode: 'KR',
      police: '112',
      ambulance: '119',
      fire: '119',
      touristPolice: '1330',
    ),
    EmergencyContact(
      country: 'China',
      countryCode: 'CN',
      police: '110',
      ambulance: '120',
      fire: '119',
    ),
  ];

  static EmergencyContact? forCountry(String code) {
    try {
      return builtIn.firstWhere(
          (c) => c.countryCode.toUpperCase() == code.toUpperCase());
    } catch (_) {
      return null;
    }
  }
}
