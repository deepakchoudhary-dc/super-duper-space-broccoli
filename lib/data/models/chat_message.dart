// Chat message model for the AI assistant.

enum MessageRole { user, assistant, system }

class ChatMessage {
  final String id;
  final String content;
  final MessageRole role;
  final DateTime timestamp;
  final String? tripId;
  final bool isLoading;

  const ChatMessage({
    required this.id,
    required this.content,
    required this.role,
    required this.timestamp,
    this.tripId,
    this.isLoading = false,
  });

  ChatMessage copyWith({
    String? id,
    String? content,
    MessageRole? role,
    DateTime? timestamp,
    String? tripId,
    bool? isLoading,
  }) =>
      ChatMessage(
        id: id ?? this.id,
        content: content ?? this.content,
        role: role ?? this.role,
        timestamp: timestamp ?? this.timestamp,
        tripId: tripId ?? this.tripId,
        isLoading: isLoading ?? this.isLoading,
      );

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['id'] as String,
        content: j['content'] as String,
        role: MessageRole.values.firstWhere(
          (e) => e.name == j['role'],
          orElse: () => MessageRole.user,
        ),
        timestamp: DateTime.parse(j['timestamp'] as String),
        tripId: j['tripId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'content': content,
        'role': role.name,
        'timestamp': timestamp.toIso8601String(),
        'tripId': tripId,
      };
}
