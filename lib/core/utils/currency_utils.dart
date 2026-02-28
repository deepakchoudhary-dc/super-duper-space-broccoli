import 'package:intl/intl.dart';

/// Format and convert currencies.
class CurrencyUtils {
  CurrencyUtils._();

  static const Map<String, String> symbols = {
    'USD': '\$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥',
    'INR': '₹', 'AUD': 'A\$', 'CAD': 'C\$', 'CHF': 'Fr', 'KRW': '₩',
    'THB': '฿', 'SGD': 'S\$', 'MXN': 'MX\$', 'BRL': 'R\$',
  };

  static String format(double amount, String code) {
    final sym = symbols[code] ?? code;
    return '$sym${NumberFormat('#,##0.00').format(amount)}';
  }

  static String formatCompact(double amount, String code) {
    final sym = symbols[code] ?? code;
    if (amount >= 1000) {
      return '$sym${NumberFormat.compact().format(amount)}';
    }
    return format(amount, code);
  }
}
