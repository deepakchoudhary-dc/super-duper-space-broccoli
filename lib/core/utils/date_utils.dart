import 'package:intl/intl.dart';

/// Date/time helpers used throughout the app.
class AppDateUtils {
  AppDateUtils._();

  static String formatDate(DateTime d) => DateFormat('MMM dd, yyyy').format(d);
  static String formatShort(DateTime d) => DateFormat('MMM dd').format(d);
  static String formatTime(DateTime d) => DateFormat('HH:mm').format(d);
  static String formatFull(DateTime d) =>
      DateFormat('EEE, MMM dd yyyy – HH:mm').format(d);

  static String relative(DateTime d) {
    final diff = d.difference(DateTime.now());
    if (diff.inDays.abs() > 7) return formatDate(d);
    if (diff.inDays > 1) return 'in ${diff.inDays} days';
    if (diff.inDays == 1) return 'tomorrow';
    if (diff.inDays == 0 && diff.isNegative == false) {
      if (diff.inHours > 0) return 'in ${diff.inHours}h';
      if (diff.inMinutes > 0) return 'in ${diff.inMinutes}m';
      return 'now';
    }
    if (diff.inDays == -1) return 'yesterday';
    return '${diff.inDays.abs()} days ago';
  }

  static int daysBetween(DateTime a, DateTime b) =>
      DateTime(b.year, b.month, b.day)
          .difference(DateTime(a.year, a.month, a.day))
          .inDays;
}
