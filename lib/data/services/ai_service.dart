import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../core/config/app_config.dart';
import '../models/chat_message.dart';
import '../models/trip.dart';

/// OpenAI GPT‑4o powered service for chat + itinerary generation.
class AiService {
  final http.Client _client;

  AiService({http.Client? client}) : _client = client ?? http.Client();

  // ── Chat ────────────────────────────────────────────────────────────
  Future<String> chat({
    required String message,
    List<ChatMessage> history = const [],
    Trip? currentTrip,
    Map<String, dynamic>? weather,
    List<String>? nearbyPlaces,
  }) async {
    final messages = <Map<String, String>>[
      {'role': 'system', 'content': _systemPrompt(currentTrip, weather, nearbyPlaces)},
      ...history.take(12).map((m) => {'role': m.role.name, 'content': m.content}),
      {'role': 'user', 'content': message},
    ];
    return _complete(messages);
  }

  // ── Itinerary Generation ────────────────────────────────────────────
  Future<String> generateItinerary({
    required String destination,
    required int days,
    String? interests,
    String? budget,
    String? travelStyle,
    String? weather,
  }) async {
    final prompt = StringBuffer()
      ..writeln('Create a detailed $days-day travel itinerary for **$destination**.')
      ..writeln()
      ..writeln('REQUIREMENTS:')
      ..writeln('- Provide a structured plan for each day')
      ..writeln('- Include specific place names with approximate GPS coordinates')
      ..writeln('- Include estimated time (e.g. "9:00 AM – 11:00 AM")')
      ..writeln('- Include estimated cost per activity in USD')
      ..writeln('- Group nearby activities together to minimise travel')
      ..writeln('- Include a mix of: sightseeing, food, culture, relaxation')
      ..writeln()
      ..writeln('USER PREFERENCES:');
    if (interests != null) prompt.writeln('Interests: $interests');
    if (budget != null) prompt.writeln('Budget level: $budget');
    if (travelStyle != null) prompt.writeln('Travel style: $travelStyle');
    if (weather != null) prompt.writeln('Expected weather: $weather');
    prompt
      ..writeln()
      ..writeln('FORMAT each activity as:')
      ..writeln('**[Activity Name]** | [Address/Location] | [Start]-[End] | ~\$[Cost]')
      ..writeln('Brief description.')
      ..writeln()
      ..writeln('Respond ONLY with the itinerary, no preamble.');

    return _complete([
      {'role': 'system', 'content': 'You are an expert travel planner with deep knowledge of destinations worldwide. You create optimised, realistic itineraries.'},
      {'role': 'user', 'content': prompt.toString()},
    ], maxTokens: AppConfig.aiMaxTokens);
  }

  // ── Smart Re‑planning ──────────────────────────────────────────────
  Future<String> replanForWeather({
    required String currentPlan,
    required String weatherForecast,
  }) async {
    return _complete([
      {'role': 'system', 'content': 'You are a travel assistant. Re-optimise the itinerary based on weather. Move outdoor activities to good-weather days, suggest indoor alternatives for rainy/extreme days.'},
      {'role': 'user', 'content': 'Current plan:\n$currentPlan\n\nWeather:\n$weatherForecast\n\nPlease re-optimise.'},
    ]);
  }

  // ── Translation Helper ─────────────────────────────────────────────
  Future<String> translate({
    required String text,
    required String targetLang,
  }) async {
    return _complete([
      {'role': 'system', 'content': 'You are a translator. Translate the text and provide phonetic pronunciation where helpful. Be concise.'},
      {'role': 'user', 'content': 'Translate to $targetLang:\n"$text"'},
    ], maxTokens: 500);
  }

  // ── Budget Suggestions ─────────────────────────────────────────────
  Future<String> suggestBudgetAlternatives({
    required String destination,
    required String category,
    required double currentSpend,
    required double budget,
  }) async {
    return _complete([
      {'role': 'system', 'content': 'You are a budget travel advisor. Suggest cheaper alternatives.'},
      {'role': 'user', 'content': 'In $destination, I\'ve spent \$${currentSpend.toStringAsFixed(0)} of my \$${budget.toStringAsFixed(0)} budget on $category. Suggest 3 cheaper alternatives.'},
    ], maxTokens: 600);
  }

  // ── Private ────────────────────────────────────────────────────────
  Future<String> _complete(
    List<Map<String, String>> messages, {
    int? maxTokens,
  }) async {
    if (AppConfig.openaiApiKey.isEmpty) {
      return _offlineFallback(messages.last['content'] ?? '');
    }
    try {
      final res = await _client.post(
        Uri.parse('${AppConfig.openaiBaseUrl}/chat/completions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${AppConfig.openaiApiKey}',
        },
        body: jsonEncode({
          'model': AppConfig.aiModel,
          'messages': messages,
          'max_tokens': maxTokens ?? AppConfig.aiMaxTokens,
          'temperature': AppConfig.aiTemperature,
        }),
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['choices'][0]['message']['content'] as String;
      }
      return 'AI service returned status ${res.statusCode}. Please try again.';
    } catch (e) {
      return _offlineFallback(messages.last['content'] ?? '');
    }
  }

  String _systemPrompt(Trip? trip, Map<String, dynamic>? weather, List<String>? nearby) {
    final b = StringBuffer()
      ..writeln('You are Travel Companion AI – an expert travel assistant.')
      ..writeln('Provide concise, actionable advice with specific recommendations.')
      ..writeln('Include safety tips when relevant.');
    if (trip != null) {
      b.writeln('\nCurrent trip: ${trip.destination} (${trip.startDate.toIso8601String().substring(0, 10)} to ${trip.endDate.toIso8601String().substring(0, 10)})');
      b.writeln('Budget: ${trip.currency} ${trip.budget}');
    }
    if (weather != null) b.writeln('Weather: ${jsonEncode(weather)}');
    if (nearby != null && nearby.isNotEmpty) {
      b.writeln('Nearby places: ${nearby.join(", ")}');
    }
    return b.toString();
  }

  String _offlineFallback(String query) {
    return '🔌 **Offline Mode**\n\n'
        'I can\'t reach the AI service right now. Here are some general tips:\n\n'
        '• Check your saved itinerary for today\'s activities\n'
        '• Use the offline maps feature for navigation\n'
        '• Emergency numbers are available in the SOS section\n'
        '• Currency converter works offline with cached rates\n\n'
        '_Connect to the internet for personalised AI assistance._';
  }

  void dispose() => _client.close();
}
