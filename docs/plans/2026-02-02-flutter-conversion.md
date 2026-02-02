# Ello Flutter Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the Ello address book cleanup app from Node.js/React to a fully local Flutter application that runs entirely on the device with no server dependency.

**Architecture:** Single Flutter app with local SQLite database (using drift), Dart services replacing the Node.js backend, and Flutter widgets replacing React components. All data stays on-device for privacy. The app will support iOS, Android, macOS, Windows, and Linux.

**Tech Stack:**
- Flutter 3.x with Dart
- drift (SQLite ORM with FTS5 support)
- riverpod (state management)
- go_router (navigation)
- flutter_map or google_maps_flutter (mapping)
- phone_numbers_parser (phone formatting)
- file_picker (vCard import)
- image (photo processing)
- google_sign_in (optional: for syncing Google Contacts photos)

---

## Phase 1: Project Setup & Core Infrastructure (Week 1-2)

### Task 1.1: Create Flutter Project Structure

**Files:**
- Create: `ello_flutter/` (new Flutter project)
- Create: `ello_flutter/lib/main.dart`
- Create: `ello_flutter/lib/app.dart`
- Create: `ello_flutter/pubspec.yaml`

**Step 1: Create the Flutter project**

```bash
cd "/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup"
flutter create ello_flutter --org com.ello --platforms=ios,android,macos,windows,linux
cd ello_flutter
```

**Step 2: Add dependencies to pubspec.yaml**

```yaml
name: ello_flutter
description: Address Book Cleanup - A privacy-first contact management app
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter

  # State Management
  flutter_riverpod: ^2.4.0
  riverpod_annotation: ^2.3.0

  # Database
  drift: ^2.14.0
  sqlite3_flutter_libs: ^0.5.0
  path_provider: ^2.1.0
  path: ^1.8.0

  # Navigation
  go_router: ^13.0.0

  # Phone number parsing
  phone_numbers_parser: ^8.2.0

  # File handling
  file_picker: ^6.1.0

  # Image processing
  image: ^4.1.0

  # Maps
  flutter_map: ^6.1.0
  latlong2: ^0.9.0
  flutter_map_marker_cluster: ^1.3.0

  # Google Sign In (optional, for photo sync)
  google_sign_in: ^6.2.0

  # Utils
  uuid: ^4.2.0
  intl: ^0.18.0
  collection: ^1.18.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0
  drift_dev: ^2.14.0
  build_runner: ^2.4.0
  riverpod_generator: ^2.3.0

flutter:
  uses-material-design: true
```

**Step 3: Run flutter pub get**

```bash
flutter pub get
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: initialize Flutter project with dependencies

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.2: Set Up Drift Database Schema

**Files:**
- Create: `lib/data/database/database.dart`
- Create: `lib/data/database/tables/contacts.dart`
- Create: `lib/data/database/tables/contact_emails.dart`
- Create: `lib/data/database/tables/contact_phones.dart`
- Create: `lib/data/database/tables/contact_addresses.dart`
- Create: `lib/data/database/tables/contact_social_profiles.dart`
- Create: `lib/data/database/tables/contact_categories.dart`
- Create: `lib/data/database/tables/contact_instant_messages.dart`
- Create: `lib/data/database/tables/contact_urls.dart`
- Create: `lib/data/database/tables/contact_related_people.dart`
- Create: `lib/data/database/tables/user_settings.dart`

**Step 1: Create the contacts table definition**

```dart
// lib/data/database/tables/contacts.dart
import 'package:drift/drift.dart';

class Contacts extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get firstName => text().nullable()();
  TextColumn get lastName => text().nullable()();
  TextColumn get displayName => text()();
  TextColumn get company => text().nullable()();
  TextColumn get title => text().nullable()();
  TextColumn get notes => text().nullable()();
  TextColumn get birthday => text().nullable()();
  TextColumn get photoHash => text().nullable()();
  TextColumn get rawVcard => text().nullable()();
  DateTimeColumn get archivedAt => dateTime().nullable()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();
}
```

**Step 2: Create contact_emails table**

```dart
// lib/data/database/tables/contact_emails.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactEmails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get email => text()();
  TextColumn get type => text().nullable()();
  BoolColumn get isPrimary => boolean().withDefault(const Constant(false))();
}
```

**Step 3: Create contact_phones table**

```dart
// lib/data/database/tables/contact_phones.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactPhones extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get phone => text()(); // E.164 format
  TextColumn get phoneDisplay => text()(); // Human-readable format
  TextColumn get countryCode => text().nullable()();
  TextColumn get type => text().nullable()();
  BoolColumn get isPrimary => boolean().withDefault(const Constant(false))();
}
```

**Step 4: Create contact_addresses table**

```dart
// lib/data/database/tables/contact_addresses.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactAddresses extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get street => text().nullable()();
  TextColumn get city => text().nullable()();
  TextColumn get state => text().nullable()();
  TextColumn get postalCode => text().nullable()();
  TextColumn get country => text().nullable()();
  TextColumn get type => text().nullable()();
  RealColumn get latitude => real().nullable()();
  RealColumn get longitude => real().nullable()();
  TextColumn get geocodedAt => text().nullable()();
}
```

**Step 5: Create contact_social_profiles table**

```dart
// lib/data/database/tables/contact_social_profiles.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactSocialProfiles extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get platform => text()();
  TextColumn get username => text()();
  TextColumn get profileUrl => text().nullable()();
  TextColumn get type => text().nullable()();
}
```

**Step 6: Create contact_categories table**

```dart
// lib/data/database/tables/contact_categories.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactCategories extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get category => text()();
}
```

**Step 7: Create contact_instant_messages table**

```dart
// lib/data/database/tables/contact_instant_messages.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactInstantMessages extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get service => text()();
  TextColumn get handle => text()();
  TextColumn get type => text().nullable()();
}
```

**Step 8: Create contact_urls table**

```dart
// lib/data/database/tables/contact_urls.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactUrls extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get url => text()();
  TextColumn get label => text().nullable()();
  TextColumn get type => text().nullable()();
}
```

**Step 9: Create contact_related_people table**

```dart
// lib/data/database/tables/contact_related_people.dart
import 'package:drift/drift.dart';
import 'contacts.dart';

class ContactRelatedPeople extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get contactId => integer().references(Contacts, #id, onDelete: KeyAction.cascade)();
  TextColumn get name => text()();
  TextColumn get relationship => text().nullable()();
}
```

**Step 10: Create user_settings table**

```dart
// lib/data/database/tables/user_settings.dart
import 'package:drift/drift.dart';

class UserSettings extends Table {
  IntColumn get id => integer()();
  TextColumn get name => text().nullable()();
  TextColumn get email => text().nullable()();
  TextColumn get phone => text().nullable()();
  TextColumn get avatarUrl => text().nullable()();
  TextColumn get website => text().nullable()();
  TextColumn get linkedinUrl => text().nullable()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column> get primaryKey => {id};
}
```

**Step 11: Create the main database file**

```dart
// lib/data/database/database.dart
import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

import 'tables/contacts.dart';
import 'tables/contact_emails.dart';
import 'tables/contact_phones.dart';
import 'tables/contact_addresses.dart';
import 'tables/contact_social_profiles.dart';
import 'tables/contact_categories.dart';
import 'tables/contact_instant_messages.dart';
import 'tables/contact_urls.dart';
import 'tables/contact_related_people.dart';
import 'tables/user_settings.dart';

part 'database.g.dart';

@DriftDatabase(tables: [
  Contacts,
  ContactEmails,
  ContactPhones,
  ContactAddresses,
  ContactSocialProfiles,
  ContactCategories,
  ContactInstantMessages,
  ContactUrls,
  ContactRelatedPeople,
  UserSettings,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration {
    return MigrationStrategy(
      onCreate: (Migrator m) async {
        await m.createAll();
        // Insert default user settings row
        await into(userSettings).insert(
          UserSettingsCompanion.insert(id: const Value(1)),
        );
      },
      onUpgrade: (Migrator m, int from, int to) async {
        // Handle future migrations here
      },
    );
  }
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'ello_contacts.db'));
    return NativeDatabase.createInBackground(file);
  });
}
```

**Step 12: Generate the database code**

```bash
dart run build_runner build --delete-conflicting-outputs
```

**Step 13: Commit**

```bash
git add .
git commit -m "feat: add drift database schema with all contact tables

- Contacts table with all fields including archived_at
- Related tables: emails, phones, addresses, social profiles
- Categories, instant messages, URLs, related people
- User settings table

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.3: Set Up FTS5 Full-Text Search

**Files:**
- Modify: `lib/data/database/database.dart`
- Create: `lib/data/database/daos/search_dao.dart`

**Step 1: Add FTS5 virtual table creation**

Add to `database.dart` after the `MigrationStrategy`:

```dart
// Add this method to AppDatabase class
Future<void> setupFts() async {
  // Create FTS5 virtual table for full-text search
  await customStatement('''
    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
      searchable_text,
      content='',
      contentless_delete=1,
      tokenize="unicode61 tokenchars '@.'"
    )
  ''');
}

// Call this after database initialization
Future<void> rebuildSearchIndex() async {
  await customStatement('DELETE FROM contacts_fts');

  final allContacts = await select(contacts).get();
  for (final contact in allContacts) {
    final searchText = await _buildSearchableText(contact.id);
    if (searchText.trim().isNotEmpty) {
      await customStatement(
        'INSERT INTO contacts_fts(rowid, searchable_text) VALUES (?, ?)',
        [contact.id, searchText],
      );
    }
  }
}

Future<String> _buildSearchableText(int contactId) async {
  final parts = <String>[];

  // Get contact main fields
  final contact = await (select(contacts)..where((t) => t.id.equals(contactId))).getSingleOrNull();
  if (contact != null) {
    if (contact.firstName != null) parts.add(contact.firstName!);
    if (contact.lastName != null) parts.add(contact.lastName!);
    parts.add(contact.displayName);
    if (contact.company != null) parts.add(contact.company!);
    if (contact.title != null) parts.add(contact.title!);
    if (contact.notes != null) parts.add(contact.notes!);
  }

  // Get emails
  final emails = await (select(contactEmails)..where((t) => t.contactId.equals(contactId))).get();
  for (final e in emails) parts.add(e.email);

  // Get phones
  final phones = await (select(contactPhones)..where((t) => t.contactId.equals(contactId))).get();
  for (final p in phones) parts.add(p.phoneDisplay);

  // Get addresses
  final addresses = await (select(contactAddresses)..where((t) => t.contactId.equals(contactId))).get();
  for (final a in addresses) {
    if (a.street != null) parts.add(a.street!);
    if (a.city != null) parts.add(a.city!);
    if (a.state != null) parts.add(a.state!);
    if (a.postalCode != null) parts.add(a.postalCode!);
    if (a.country != null) parts.add(a.country!);
  }

  // Get social profiles
  final socials = await (select(contactSocialProfiles)..where((t) => t.contactId.equals(contactId))).get();
  for (final s in socials) parts.add(s.username);

  // Get categories
  final categories = await (select(contactCategories)..where((t) => t.contactId.equals(contactId))).get();
  for (final c in categories) parts.add(c.category);

  return parts.join(' ');
}

Future<void> updateContactSearchIndex(int contactId) async {
  await customStatement('DELETE FROM contacts_fts WHERE rowid = ?', [contactId]);
  final searchText = await _buildSearchableText(contactId);
  if (searchText.trim().isNotEmpty) {
    await customStatement(
      'INSERT INTO contacts_fts(rowid, searchable_text) VALUES (?, ?)',
      [contactId, searchText],
    );
  }
}

Future<List<int>> searchContacts(String query) async {
  if (query.isEmpty) return [];

  final results = await customSelect(
    'SELECT rowid FROM contacts_fts WHERE searchable_text MATCH ? ORDER BY rank',
    variables: [Variable.withString('"$query"*')],
  ).get();

  return results.map((row) => row.read<int>('rowid')).toList();
}
```

**Step 2: Regenerate database code**

```bash
dart run build_runner build --delete-conflicting-outputs
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add FTS5 full-text search for contacts

- Create contacts_fts virtual table with proper tokenizer
- Build searchable text from all contact fields
- Support incremental index updates

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 1.4: Create Data Models

**Files:**
- Create: `lib/data/models/contact.dart`
- Create: `lib/data/models/contact_detail.dart`

**Step 1: Create contact model**

```dart
// lib/data/models/contact.dart
import 'package:flutter/foundation.dart';

@immutable
class ContactEmail {
  final int id;
  final int contactId;
  final String email;
  final String? type;
  final bool isPrimary;

  const ContactEmail({
    required this.id,
    required this.contactId,
    required this.email,
    this.type,
    this.isPrimary = false,
  });
}

@immutable
class ContactPhone {
  final int id;
  final int contactId;
  final String phone;
  final String phoneDisplay;
  final String? countryCode;
  final String? type;
  final bool isPrimary;

  const ContactPhone({
    required this.id,
    required this.contactId,
    required this.phone,
    required this.phoneDisplay,
    this.countryCode,
    this.type,
    this.isPrimary = false,
  });
}

@immutable
class ContactAddress {
  final int id;
  final int contactId;
  final String? street;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? country;
  final String? type;
  final double? latitude;
  final double? longitude;

  const ContactAddress({
    required this.id,
    required this.contactId,
    this.street,
    this.city,
    this.state,
    this.postalCode,
    this.country,
    this.type,
    this.latitude,
    this.longitude,
  });

  String get formattedAddress {
    final parts = <String>[];
    if (street != null && street!.isNotEmpty) parts.add(street!);
    if (city != null && city!.isNotEmpty) parts.add(city!);
    if (state != null && state!.isNotEmpty) parts.add(state!);
    if (postalCode != null && postalCode!.isNotEmpty) parts.add(postalCode!);
    if (country != null && country!.isNotEmpty) parts.add(country!);
    return parts.join(', ');
  }
}

@immutable
class ContactSocialProfile {
  final int id;
  final int contactId;
  final String platform;
  final String username;
  final String? profileUrl;
  final String? type;

  const ContactSocialProfile({
    required this.id,
    required this.contactId,
    required this.platform,
    required this.username,
    this.profileUrl,
    this.type,
  });
}

@immutable
class ContactCategory {
  final int id;
  final int contactId;
  final String category;

  const ContactCategory({
    required this.id,
    required this.contactId,
    required this.category,
  });
}

@immutable
class ContactInstantMessage {
  final int id;
  final int contactId;
  final String service;
  final String handle;
  final String? type;

  const ContactInstantMessage({
    required this.id,
    required this.contactId,
    required this.service,
    required this.handle,
    this.type,
  });
}

@immutable
class ContactUrl {
  final int id;
  final int contactId;
  final String url;
  final String? label;
  final String? type;

  const ContactUrl({
    required this.id,
    required this.contactId,
    required this.url,
    this.label,
    this.type,
  });
}

@immutable
class ContactRelatedPerson {
  final int id;
  final int contactId;
  final String name;
  final String? relationship;

  const ContactRelatedPerson({
    required this.id,
    required this.contactId,
    required this.name,
    this.relationship,
  });
}
```

**Step 2: Create contact detail model**

```dart
// lib/data/models/contact_detail.dart
import 'package:flutter/foundation.dart';
import 'contact.dart';

@immutable
class ContactDetail {
  final int id;
  final String? firstName;
  final String? lastName;
  final String displayName;
  final String? company;
  final String? title;
  final String? notes;
  final String? birthday;
  final String? photoHash;
  final String? rawVcard;
  final DateTime? archivedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<ContactEmail> emails;
  final List<ContactPhone> phones;
  final List<ContactAddress> addresses;
  final List<ContactSocialProfile> socialProfiles;
  final List<ContactCategory> categories;
  final List<ContactInstantMessage> instantMessages;
  final List<ContactUrl> urls;
  final List<ContactRelatedPerson> relatedPeople;

  const ContactDetail({
    required this.id,
    this.firstName,
    this.lastName,
    required this.displayName,
    this.company,
    this.title,
    this.notes,
    this.birthday,
    this.photoHash,
    this.rawVcard,
    this.archivedAt,
    required this.createdAt,
    required this.updatedAt,
    this.emails = const [],
    this.phones = const [],
    this.addresses = const [],
    this.socialProfiles = const [],
    this.categories = const [],
    this.instantMessages = const [],
    this.urls = const [],
    this.relatedPeople = const [],
  });

  String? get photoUrl {
    if (photoHash == null) return null;
    // Return local file path for photo
    return 'photos/$photoHash.jpg';
  }

  bool get isArchived => archivedAt != null;

  ContactDetail copyWith({
    int? id,
    String? firstName,
    String? lastName,
    String? displayName,
    String? company,
    String? title,
    String? notes,
    String? birthday,
    String? photoHash,
    String? rawVcard,
    DateTime? archivedAt,
    DateTime? createdAt,
    DateTime? updatedAt,
    List<ContactEmail>? emails,
    List<ContactPhone>? phones,
    List<ContactAddress>? addresses,
    List<ContactSocialProfile>? socialProfiles,
    List<ContactCategory>? categories,
    List<ContactInstantMessage>? instantMessages,
    List<ContactUrl>? urls,
    List<ContactRelatedPerson>? relatedPeople,
  }) {
    return ContactDetail(
      id: id ?? this.id,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      displayName: displayName ?? this.displayName,
      company: company ?? this.company,
      title: title ?? this.title,
      notes: notes ?? this.notes,
      birthday: birthday ?? this.birthday,
      photoHash: photoHash ?? this.photoHash,
      rawVcard: rawVcard ?? this.rawVcard,
      archivedAt: archivedAt ?? this.archivedAt,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      emails: emails ?? this.emails,
      phones: phones ?? this.phones,
      addresses: addresses ?? this.addresses,
      socialProfiles: socialProfiles ?? this.socialProfiles,
      categories: categories ?? this.categories,
      instantMessages: instantMessages ?? this.instantMessages,
      urls: urls ?? this.urls,
      relatedPeople: relatedPeople ?? this.relatedPeople,
    );
  }
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add contact data models

- ContactDetail with all related data
- Separate models for emails, phones, addresses, etc.
- Immutable classes with copyWith support

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Core Services (Week 2-4)

### Task 2.1: Port vCard Parser

**Files:**
- Create: `lib/services/vcard_parser.dart`
- Create: `lib/services/vcard_parser_test.dart` (tests)

**Step 1: Write the failing test**

```dart
// test/services/vcard_parser_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:ello_flutter/services/vcard_parser.dart';

void main() {
  group('VCardParser', () {
    test('parses simple vCard 3.0 with name and email', () {
      const vcf = '''BEGIN:VCARD
VERSION:3.0
FN:John Doe
N:Doe;John;;;
EMAIL:john@example.com
END:VCARD''';

      final result = VCardParser.parse(vcf);

      expect(result.contacts.length, 1);
      expect(result.contacts[0].displayName, 'John Doe');
      expect(result.contacts[0].firstName, 'John');
      expect(result.contacts[0].lastName, 'Doe');
      expect(result.contacts[0].emails.length, 1);
      expect(result.contacts[0].emails[0].email, 'john@example.com');
    });

    test('parses phone numbers with type', () {
      const vcf = '''BEGIN:VCARD
VERSION:3.0
FN:Jane Smith
TEL;TYPE=CELL:+1-555-123-4567
TEL;TYPE=WORK:+1-555-987-6543
END:VCARD''';

      final result = VCardParser.parse(vcf);

      expect(result.contacts[0].phones.length, 2);
      expect(result.contacts[0].phones[0].type, 'cell');
    });

    test('parses address', () {
      const vcf = '''BEGIN:VCARD
VERSION:3.0
FN:Bob Johnson
ADR;TYPE=HOME:;;123 Main St;Anytown;CA;90210;USA
END:VCARD''';

      final result = VCardParser.parse(vcf);

      expect(result.contacts[0].addresses.length, 1);
      expect(result.contacts[0].addresses[0].street, '123 Main St');
      expect(result.contacts[0].addresses[0].city, 'Anytown');
      expect(result.contacts[0].addresses[0].state, 'CA');
      expect(result.contacts[0].addresses[0].postalCode, '90210');
    });

    test('handles multiple vCards in single file', () {
      const vcf = '''BEGIN:VCARD
VERSION:3.0
FN:Person One
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Person Two
END:VCARD''';

      final result = VCardParser.parse(vcf);

      expect(result.contacts.length, 2);
    });
  });
}
```

**Step 2: Run test to verify it fails**

```bash
flutter test test/services/vcard_parser_test.dart
```

Expected: FAIL with "Target of URI hasn't been generated"

**Step 3: Write the vCard parser implementation**

```dart
// lib/services/vcard_parser.dart
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

class ParsedEmail {
  final String email;
  final String? type;
  final bool isPrimary;

  ParsedEmail({required this.email, this.type, this.isPrimary = false});
}

class ParsedPhone {
  final String phone; // E.164 format
  final String phoneDisplay; // Human-readable
  final String? countryCode;
  final String? type;
  final bool isPrimary;

  ParsedPhone({
    required this.phone,
    required this.phoneDisplay,
    this.countryCode,
    this.type,
    this.isPrimary = false,
  });
}

class ParsedAddress {
  final String? street;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? country;
  final String? type;

  ParsedAddress({
    this.street,
    this.city,
    this.state,
    this.postalCode,
    this.country,
    this.type,
  });
}

class ParsedSocialProfile {
  final String platform;
  final String? username;
  final String url;

  ParsedSocialProfile({
    required this.platform,
    this.username,
    required this.url,
  });
}

class ParsedContact {
  final String? firstName;
  final String? lastName;
  final String displayName;
  final String? company;
  final String? title;
  final String? notes;
  final String? birthday;
  final List<ParsedEmail> emails;
  final List<ParsedPhone> phones;
  final List<ParsedAddress> addresses;
  final List<String> categories;
  final List<ParsedSocialProfile> socialProfiles;
  final String? photoBase64;
  final String rawVcard;

  ParsedContact({
    this.firstName,
    this.lastName,
    required this.displayName,
    this.company,
    this.title,
    this.notes,
    this.birthday,
    this.emails = const [],
    this.phones = const [],
    this.addresses = const [],
    this.categories = const [],
    this.socialProfiles = const [],
    this.photoBase64,
    required this.rawVcard,
  });
}

class ParseError {
  final int line;
  final String reason;

  ParseError({required this.line, required this.reason});
}

class ParseResult {
  final List<ParsedContact> contacts;
  final List<ParseError> errors;

  ParseResult({this.contacts = const [], this.errors = const []});
}

class VCardParser {
  /// Parse a VCF file content and return parsed contacts
  static ParseResult parse(String vcfContent) {
    final contacts = <ParsedContact>[];
    final errors = <ParseError>[];

    // Unfold lines (lines starting with space/tab are continuations)
    final unfolded = _unfoldLines(vcfContent);

    // Split into individual vCard blocks
    final vcardBlocks = unfolded
        .split(RegExp(r'(?=BEGIN:VCARD)', caseSensitive: false))
        .where((block) => block.trim().isNotEmpty)
        .toList();

    for (var i = 0; i < vcardBlocks.length; i++) {
      final block = vcardBlocks[i].trim();
      if (!block.toUpperCase().startsWith('BEGIN:VCARD')) continue;

      try {
        final parsed = _parseSingleVcard(block);
        if (parsed != null) {
          contacts.add(parsed);
        }
      } catch (e) {
        errors.add(ParseError(line: i + 1, reason: e.toString()));
      }
    }

    return ParseResult(contacts: contacts, errors: errors);
  }

  static String _unfoldLines(String content) {
    return content
        .replaceAll(RegExp(r'\r\n[ \t]'), '')
        .replaceAll(RegExp(r'\n[ \t]'), '');
  }

  static ParsedContact? _parseSingleVcard(String vcardText) {
    final lines = vcardText.split(RegExp(r'\r?\n'));

    String? fn;
    String? firstName;
    String? lastName;
    String? company;
    String? title;
    String? notes;
    String? birthday;
    String? photoBase64;
    final emails = <ParsedEmail>[];
    final phones = <ParsedPhone>[];
    final addresses = <ParsedAddress>[];
    final categories = <String>[];
    final socialProfiles = <ParsedSocialProfile>[];

    for (final line in lines) {
      if (line.trim().isEmpty) continue;

      final colonIndex = line.indexOf(':');
      if (colonIndex == -1) continue;

      final propertyPart = line.substring(0, colonIndex);
      final valuePart = line.substring(colonIndex + 1);

      // Parse property name and parameters
      final semicolonIndex = propertyPart.indexOf(';');
      final propertyName = (semicolonIndex == -1
          ? propertyPart
          : propertyPart.substring(0, semicolonIndex)).toUpperCase();
      final params = semicolonIndex == -1
          ? <String, String>{}
          : _parseParams(propertyPart.substring(semicolonIndex + 1));

      switch (propertyName) {
        case 'FN':
          fn = valuePart.trim();
          break;
        case 'N':
          final parts = valuePart.split(';');
          if (parts.isNotEmpty) lastName = parts[0].isNotEmpty ? parts[0] : null;
          if (parts.length > 1) firstName = parts[1].isNotEmpty ? parts[1] : null;
          break;
        case 'EMAIL':
          final email = valuePart.replaceFirst(RegExp(r'^mailto:', caseSensitive: false), '');
          if (email.isNotEmpty) {
            emails.add(ParsedEmail(
              email: email,
              type: _extractType(params),
              isPrimary: emails.isEmpty,
            ));
          }
          break;
        case 'TEL':
          final rawPhone = valuePart.replaceFirst(RegExp(r'^tel:', caseSensitive: false), '');
          if (rawPhone.isNotEmpty) {
            final parsed = _parsePhone(rawPhone);
            phones.add(ParsedPhone(
              phone: parsed.phone,
              phoneDisplay: parsed.phoneDisplay,
              countryCode: parsed.countryCode,
              type: _extractType(params),
              isPrimary: phones.isEmpty,
            ));
          }
          break;
        case 'ADR':
          final parts = valuePart.split(';');
          if (parts.length >= 3) {
            addresses.add(ParsedAddress(
              street: parts.length > 2 && parts[2].isNotEmpty ? parts[2] : null,
              city: parts.length > 3 && parts[3].isNotEmpty ? parts[3] : null,
              state: parts.length > 4 && parts[4].isNotEmpty ? parts[4] : null,
              postalCode: parts.length > 5 && parts[5].isNotEmpty ? parts[5] : null,
              country: parts.length > 6 && parts[6].isNotEmpty ? parts[6] : null,
              type: _extractType(params),
            ));
          }
          break;
        case 'ORG':
          company = valuePart.split(';').first;
          break;
        case 'TITLE':
          title = valuePart;
          break;
        case 'NOTE':
          notes = valuePart;
          break;
        case 'BDAY':
          birthday = valuePart;
          break;
        case 'CATEGORIES':
          categories.addAll(valuePart.split(',').map((c) => c.trim()).where((c) => c.isNotEmpty));
          break;
        case 'PHOTO':
          // Handle base64 encoded photos
          if (params['ENCODING']?.toUpperCase() == 'B' ||
              params['ENCODING']?.toUpperCase() == 'BASE64') {
            photoBase64 = valuePart;
          } else if (valuePart.startsWith('data:image')) {
            // Data URI format
            final base64Start = valuePart.indexOf(',');
            if (base64Start != -1) {
              photoBase64 = valuePart.substring(base64Start + 1);
            }
          }
          break;
        case 'X-SOCIALPROFILE':
          String platform = 'social';
          String? username;
          String url = valuePart;

          if (params.containsKey('TYPE')) {
            platform = params['TYPE']!.toLowerCase();
          }
          if (params.containsKey('X-USER')) {
            username = params['X-USER'];
          }

          if (url.isNotEmpty) {
            socialProfiles.add(ParsedSocialProfile(
              platform: platform,
              username: username,
              url: url,
            ));
          }
          break;
      }
    }

    // Determine display name
    String displayName;
    if (fn != null && fn.isNotEmpty) {
      displayName = fn;
    } else if (firstName != null || lastName != null) {
      displayName = [firstName, lastName].where((s) => s != null).join(' ');
    } else {
      throw Exception('Missing required FN or N field');
    }

    return ParsedContact(
      firstName: firstName,
      lastName: lastName,
      displayName: displayName,
      company: company,
      title: title,
      notes: notes,
      birthday: birthday,
      emails: emails,
      phones: phones,
      addresses: addresses,
      categories: categories,
      socialProfiles: socialProfiles,
      photoBase64: photoBase64,
      rawVcard: vcardText,
    );
  }

  static Map<String, String> _parseParams(String paramString) {
    final params = <String, String>{};
    final parts = paramString.split(';');
    for (final part in parts) {
      final eqIndex = part.indexOf('=');
      if (eqIndex != -1) {
        final key = part.substring(0, eqIndex).toUpperCase();
        final value = part.substring(eqIndex + 1);
        params[key] = value;
      } else {
        // Some params are just TYPE values without TYPE=
        params['TYPE'] = part;
      }
    }
    return params;
  }

  static String? _extractType(Map<String, String> params) {
    return params['TYPE']?.toLowerCase();
  }

  static ({String phone, String phoneDisplay, String? countryCode}) _parsePhone(String rawPhone) {
    try {
      final parsed = PhoneNumber.parse(rawPhone, callerCountry: IsoCode.US);
      final international = parsed.international;
      final phoneDisplay = international
          .replaceAll(RegExp(r'[()-]'), '')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();

      return (
        phone: parsed.international.replaceAll(RegExp(r'[^\d+]'), ''),
        phoneDisplay: phoneDisplay,
        countryCode: parsed.isoCode.name,
      );
    } catch (_) {
      // Fallback to raw value
      final cleaned = rawPhone.replaceAll(RegExp(r'[^\d+]'), '');
      return (phone: cleaned, phoneDisplay: rawPhone, countryCode: null);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
flutter test test/services/vcard_parser_test.dart
```

Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "feat: port vCard parser to Dart

- Parse vCard 2.1, 3.0, 4.0 formats
- Handle emails, phones, addresses, social profiles
- Parse categories and photos
- Normalize phone numbers using phone_numbers_parser

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2.2: Port Name Matching Service

**Files:**
- Create: `lib/services/name_matching_service.dart`
- Create: `test/services/name_matching_service_test.dart`

**Step 1: Write the failing test**

```dart
// test/services/name_matching_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:ello_flutter/services/name_matching_service.dart';

void main() {
  group('NameMatchingService', () {
    test('matches exact names', () {
      expect(NameMatchingService.namesMatch('John Doe', 'John Doe'), isTrue);
    });

    test('matches case-insensitive', () {
      expect(NameMatchingService.namesMatch('JOHN DOE', 'john doe'), isTrue);
    });

    test('matches nicknames', () {
      expect(NameMatchingService.namesMatch('William Smith', 'Bill Smith'), isTrue);
      expect(NameMatchingService.namesMatch('Robert Johnson', 'Bob Johnson'), isTrue);
      expect(NameMatchingService.namesMatch('Elizabeth Taylor', 'Liz Taylor'), isTrue);
    });

    test('matches reversed names', () {
      expect(NameMatchingService.namesMatch('John Smith', 'Smith John'), isTrue);
    });

    test('does not match different names', () {
      expect(NameMatchingService.namesMatch('John Doe', 'Jane Doe'), isFalse);
    });

    test('handles empty names', () {
      expect(NameMatchingService.namesMatch('', ''), isFalse);
      expect(NameMatchingService.namesMatch('John', ''), isFalse);
    });
  });
}
```

**Step 2: Run test to verify it fails**

```bash
flutter test test/services/name_matching_service_test.dart
```

Expected: FAIL

**Step 3: Implement name matching service**

```dart
// lib/services/name_matching_service.dart

/// Name Matching Service
///
/// Provides conservative name matching for contact deduplication.
/// Supports:
/// - Normalization (lowercase, trim, collapse spaces)
/// - Common nickname mappings
/// - Reversed name handling (e.g., "John Smith" = "Smith John")
class NameMatchingService {
  /// Nickname mapping - maps each name variant to a canonical form.
  static const Map<String, String> _nicknames = {
    // John variants
    'john': 'john', 'jon': 'john', 'jonathan': 'john', 'johnny': 'john',
    // Michael variants
    'michael': 'michael', 'mike': 'michael', 'mikey': 'michael', 'mick': 'michael',
    // William variants
    'william': 'william', 'will': 'william', 'bill': 'william', 'billy': 'william', 'liam': 'william',
    // Robert variants
    'robert': 'robert', 'rob': 'robert', 'robbie': 'robert', 'bob': 'robert', 'bobby': 'robert',
    // James variants
    'james': 'james', 'jim': 'james', 'jimmy': 'james', 'jamie': 'james',
    // Richard variants
    'richard': 'richard', 'rick': 'richard', 'ricky': 'richard', 'dick': 'richard', 'rich': 'richard',
    // Thomas variants
    'thomas': 'thomas', 'tom': 'thomas', 'tommy': 'thomas',
    // Charles variants
    'charles': 'charles', 'charlie': 'charles', 'chuck': 'charles',
    // David variants
    'david': 'david', 'dave': 'david', 'davey': 'david',
    // Joseph variants
    'joseph': 'joseph', 'joe': 'joseph', 'joey': 'joseph',
    // Daniel variants
    'daniel': 'daniel', 'dan': 'daniel', 'danny': 'daniel',
    // Matthew variants
    'matthew': 'matthew', 'matt': 'matthew',
    // Anthony variants
    'anthony': 'anthony', 'tony': 'anthony',
    // Christopher variants
    'christopher': 'christopher', 'chris': 'christopher',
    // Andrew variants
    'andrew': 'andrew', 'andy': 'andrew', 'drew': 'andrew',
    // Steven/Stephen variants
    'steven': 'steven', 'stephen': 'steven', 'steve': 'steven',
    // Edward variants
    'edward': 'edward', 'ed': 'edward', 'eddie': 'edward', 'ted': 'edward',
    // Benjamin variants
    'benjamin': 'benjamin', 'ben': 'benjamin', 'benny': 'benjamin',
    // Nicholas variants
    'nicholas': 'nicholas', 'nick': 'nicholas', 'nicky': 'nicholas',
    // Alexander variants
    'alexander': 'alexander', 'alex': 'alexander', 'alec': 'alexander',
    // Samuel variants
    'samuel': 'samuel', 'sam': 'samuel', 'sammy': 'samuel',
    // Patrick variants
    'patrick': 'patrick', 'pat': 'patrick', 'paddy': 'patrick',
    // Peter variants
    'peter': 'peter', 'pete': 'peter',
    // Gregory variants
    'gregory': 'gregory', 'greg': 'gregory',
    // Timothy variants
    'timothy': 'timothy', 'tim': 'timothy', 'timmy': 'timothy',
    // Kenneth variants
    'kenneth': 'kenneth', 'ken': 'kenneth', 'kenny': 'kenneth',
    // Ronald variants
    'ronald': 'ronald', 'ron': 'ronald', 'ronnie': 'ronald',
    // Elizabeth variants
    'elizabeth': 'elizabeth', 'liz': 'elizabeth', 'lizzy': 'elizabeth',
    'beth': 'elizabeth', 'betsy': 'elizabeth', 'betty': 'elizabeth',
    // Jennifer variants
    'jennifer': 'jennifer', 'jenny': 'jennifer', 'jen': 'jennifer',
    // Margaret variants
    'margaret': 'margaret', 'maggie': 'margaret', 'meg': 'margaret',
    'peggy': 'margaret', 'marge': 'margaret',
    // Katherine variants
    'katherine': 'katherine', 'catherine': 'katherine', 'kate': 'katherine',
    'katie': 'katherine', 'kathy': 'katherine', 'cathy': 'katherine',
    // Patricia variants
    'patricia': 'patricia', 'patty': 'patricia', 'tricia': 'patricia', 'trish': 'patricia',
    // Rebecca variants
    'rebecca': 'rebecca', 'becky': 'rebecca', 'becca': 'rebecca',
    // Susan variants
    'susan': 'susan', 'sue': 'susan', 'suzy': 'susan', 'susie': 'susan',
    // Victoria variants
    'victoria': 'victoria', 'vicky': 'victoria', 'tori': 'victoria',
    // Christine variants
    'christine': 'christine', 'christina': 'christine', 'chrissy': 'christine',
    // Deborah variants
    'deborah': 'deborah', 'debra': 'deborah', 'deb': 'deborah', 'debbie': 'deborah',
    // Jessica variants
    'jessica': 'jessica', 'jess': 'jessica', 'jessie': 'jessica',
    // Amanda variants
    'amanda': 'amanda', 'mandy': 'amanda',
    // Kimberly variants
    'kimberly': 'kimberly', 'kim': 'kimberly', 'kimmy': 'kimberly',
    // Stephanie variants
    'stephanie': 'stephanie', 'steph': 'stephanie',
    // Michelle variants
    'michelle': 'michelle', 'shelly': 'michelle',
    // Barbara variants
    'barbara': 'barbara', 'barb': 'barbara', 'barbie': 'barbara',
  };

  /// Normalizes a name by converting to lowercase, trimming whitespace,
  /// and collapsing multiple spaces into single spaces.
  static String normalizeName(String name) {
    return name.toLowerCase().trim().replaceAll(RegExp(r'\s+'), ' ');
  }

  /// Gets the canonical form of a name for nickname matching.
  static String _getCanonicalName(String name) {
    final normalized = normalizeName(name);
    return _nicknames[normalized] ?? normalized;
  }

  /// Splits a full name into individual name parts.
  static List<String> _getNameParts(String fullName) {
    return normalizeName(fullName).split(' ').where((part) => part.isNotEmpty).toList();
  }

  /// Checks if two sets of name parts match (considering nicknames).
  static bool _namePartsMatch(List<String> parts1, List<String> parts2) {
    if (parts1.length != parts2.length) return false;

    final canonical1 = parts1.map(_getCanonicalName).toList()..sort();
    final canonical2 = parts2.map(_getCanonicalName).toList()..sort();

    for (var i = 0; i < canonical1.length; i++) {
      if (canonical1[i] != canonical2[i]) return false;
    }

    return true;
  }

  /// Checks if two names match using conservative matching rules:
  /// - Exact match (after normalization)
  /// - Nickname matching (john = jonathan, mike = michael, etc.)
  /// - Reversed name handling ("John Smith" = "Smith John")
  static bool namesMatch(String name1, String name2) {
    if (name1.isEmpty || name2.isEmpty) return false;

    final normalized1 = normalizeName(name1);
    final normalized2 = normalizeName(name2);

    // Exact match after normalization
    if (normalized1 == normalized2) return true;

    // Get name parts
    final parts1 = _getNameParts(name1);
    final parts2 = _getNameParts(name2);

    // Single name comparison
    if (parts1.length == 1 && parts2.length == 1) {
      return _getCanonicalName(parts1[0]) == _getCanonicalName(parts2[0]);
    }

    // Multi-part name comparison (handles nicknames and reversed order)
    return _namePartsMatch(parts1, parts2);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
flutter test test/services/name_matching_service_test.dart
```

Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "feat: port name matching service to Dart

- Conservative name matching for deduplication
- Support for 100+ common nickname mappings
- Reversed name handling
- Case-insensitive matching

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2.3: Create Deduplication Service

**Files:**
- Create: `lib/services/deduplication_service.dart`
- Create: `test/services/deduplication_service_test.dart`

**Step 1: Write the failing test**

```dart
// test/services/deduplication_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:ello_flutter/services/deduplication_service.dart';

void main() {
  group('DeduplicationService', () {
    test('UnionFind groups connected elements', () {
      final uf = UnionFind();
      uf.union(1, 2);
      uf.union(2, 3);
      uf.union(4, 5);

      final groups = uf.getGroups();
      expect(groups.length, 2);
    });

    test('determines confidence levels correctly', () {
      // Very high: email + phone match
      expect(
        DeduplicationService.determineConfidence(
          hasEmailMatch: true,
          hasPhoneMatch: true,
          hasSocialMatch: false,
          hasNameMatch: false,
          score: 2,
        ),
        'very_high',
      );

      // High: 2 matching fields
      expect(
        DeduplicationService.determineConfidence(
          hasEmailMatch: true,
          hasPhoneMatch: false,
          hasSocialMatch: true,
          hasNameMatch: false,
          score: 2,
        ),
        'high',
      );

      // Medium: 1 exact + name match
      expect(
        DeduplicationService.determineConfidence(
          hasEmailMatch: true,
          hasPhoneMatch: false,
          hasSocialMatch: false,
          hasNameMatch: true,
          score: 2,
        ),
        'medium',
      );
    });
  });
}
```

**Step 2: Run test to verify it fails**

```bash
flutter test test/services/deduplication_service_test.dart
```

**Step 3: Implement deduplication service**

```dart
// lib/services/deduplication_service.dart
import '../data/database/database.dart';
import '../data/models/contact_detail.dart';
import 'name_matching_service.dart';

enum ConfidenceLevel { veryHigh, high, medium }

enum DeduplicationMode { recommended, email, phone, address, social }

class DuplicateGroup {
  final String id;
  final String matchingValue;
  final DeduplicationMode matchingField;
  final List<ContactDetail> contacts;
  final ConfidenceLevel? confidence;
  final List<String> matchedCriteria;

  DuplicateGroup({
    required this.id,
    required this.matchingValue,
    required this.matchingField,
    required this.contacts,
    this.confidence,
    this.matchedCriteria = const [],
  });
}

class DuplicateSummary {
  final int email;
  final int phone;
  final int address;
  final int social;
  final int recommendedVeryHigh;
  final int recommendedHigh;
  final int recommendedMedium;

  DuplicateSummary({
    required this.email,
    required this.phone,
    required this.address,
    required this.social,
    required this.recommendedVeryHigh,
    required this.recommendedHigh,
    required this.recommendedMedium,
  });

  int get recommendedTotal => recommendedVeryHigh + recommendedHigh + recommendedMedium;
}

/// Union-Find data structure for grouping connected contacts
class UnionFind {
  final Map<int, int> _parent = {};
  final Map<int, int> _rank = {};

  int find(int x) {
    if (!_parent.containsKey(x)) {
      _parent[x] = x;
      _rank[x] = 0;
    }
    if (_parent[x] != x) {
      _parent[x] = find(_parent[x]!);
    }
    return _parent[x]!;
  }

  void union(int x, int y) {
    final rootX = find(x);
    final rootY = find(y);
    if (rootX == rootY) return;

    final rankX = _rank[rootX]!;
    final rankY = _rank[rootY]!;

    if (rankX < rankY) {
      _parent[rootX] = rootY;
    } else if (rankX > rankY) {
      _parent[rootY] = rootX;
    } else {
      _parent[rootY] = rootX;
      _rank[rootX] = rankX + 1;
    }
  }

  Map<int, List<int>> getGroups() {
    final groups = <int, List<int>>{};
    for (final id in _parent.keys) {
      final root = find(id);
      groups.putIfAbsent(root, () => []);
      groups[root]!.add(id);
    }
    return groups;
  }
}

class ContactMatchData {
  final int id;
  final String displayName;
  final List<String> emails;
  final List<String> phones;
  final List<String> socials;

  ContactMatchData({
    required this.id,
    required this.displayName,
    this.emails = const [],
    this.phones = const [],
    this.socials = const [],
  });
}

class CandidatePair {
  final int contactId1;
  final int contactId2;
  int score;
  final List<String> matchedCriteria;
  bool hasEmailMatch;
  bool hasPhoneMatch;
  bool hasSocialMatch;
  bool hasNameMatch;

  CandidatePair({
    required this.contactId1,
    required this.contactId2,
    this.score = 0,
    List<String>? matchedCriteria,
    this.hasEmailMatch = false,
    this.hasPhoneMatch = false,
    this.hasSocialMatch = false,
    this.hasNameMatch = false,
  }) : matchedCriteria = matchedCriteria ?? [];
}

class DeduplicationService {
  final AppDatabase _db;

  DeduplicationService(this._db);

  /// Determine confidence level based on match types
  static String? determineConfidence({
    required bool hasEmailMatch,
    required bool hasPhoneMatch,
    required bool hasSocialMatch,
    required bool hasNameMatch,
    required int score,
  }) {
    // Very High: 3+ matching fields OR email + phone match
    if (score >= 3) return 'very_high';
    if (hasEmailMatch && hasPhoneMatch) return 'very_high';

    // High: 2 matching fields
    if (score >= 2) return 'high';

    // Medium: 1 exact match + fuzzy name match
    final exactMatches = (hasEmailMatch ? 1 : 0) +
        (hasPhoneMatch ? 1 : 0) +
        (hasSocialMatch ? 1 : 0);
    if (exactMatches >= 1 && hasNameMatch) return 'medium';

    return null;
  }

  /// Get summary of all duplicate types
  Future<DuplicateSummary> getDuplicateSummary() async {
    final emailCount = await _countEmailDuplicateGroups();
    final phoneCount = await _countPhoneDuplicateGroups();
    final addressCount = await _countAddressDuplicateGroups();
    final socialCount = await _countSocialDuplicateGroups();
    final recommended = await _countRecommendedDuplicateGroups();

    return DuplicateSummary(
      email: emailCount,
      phone: phoneCount,
      address: addressCount,
      social: socialCount,
      recommendedVeryHigh: recommended['veryHigh']!,
      recommendedHigh: recommended['high']!,
      recommendedMedium: recommended['medium']!,
    );
  }

  Future<int> _countEmailDuplicateGroups() async {
    final result = await _db.customSelect('''
      SELECT COUNT(*) as count FROM (
        SELECT 1
        FROM contact_emails e
        JOIN contacts c ON e.contact_id = c.id
        WHERE c.archived_at IS NULL
        GROUP BY LOWER(e.email)
        HAVING COUNT(DISTINCT e.contact_id) > 1
      )
    ''').getSingle();
    return result.read<int>('count');
  }

  Future<int> _countPhoneDuplicateGroups() async {
    final result = await _db.customSelect('''
      SELECT COUNT(*) as count FROM (
        SELECT 1
        FROM contact_phones p
        JOIN contacts c ON p.contact_id = c.id
        WHERE p.phone != '' AND c.archived_at IS NULL
        GROUP BY p.phone
        HAVING COUNT(DISTINCT p.contact_id) > 1
      )
    ''').getSingle();
    return result.read<int>('count');
  }

  Future<int> _countAddressDuplicateGroups() async {
    final result = await _db.customSelect('''
      SELECT COUNT(*) as count FROM (
        SELECT 1
        FROM contact_addresses a
        JOIN contacts c ON a.contact_id = c.id
        WHERE a.street IS NOT NULL AND a.street != ''
          AND a.city IS NOT NULL AND a.city != ''
          AND c.archived_at IS NULL
        GROUP BY LOWER(a.street), LOWER(a.city), LOWER(a.postal_code)
        HAVING COUNT(DISTINCT a.contact_id) > 1
      )
    ''').getSingle();
    return result.read<int>('count');
  }

  Future<int> _countSocialDuplicateGroups() async {
    final result = await _db.customSelect('''
      SELECT COUNT(*) as count FROM (
        SELECT 1
        FROM contact_social_profiles s
        JOIN contacts c ON s.contact_id = c.id
        WHERE c.archived_at IS NULL
        GROUP BY s.platform, s.username
        HAVING COUNT(DISTINCT s.contact_id) > 1
      )
    ''').getSingle();
    return result.read<int>('count');
  }

  Future<Map<String, int>> _countRecommendedDuplicateGroups() async {
    final contacts = await _loadContactMatchData();
    final pairs = _buildCandidatePairs(contacts);
    final groups = _groupConnectedContacts(pairs);

    int veryHigh = 0, high = 0, medium = 0;
    for (final group in groups) {
      switch (group['confidence']) {
        case 'very_high':
          veryHigh++;
          break;
        case 'high':
          high++;
          break;
        case 'medium':
          medium++;
          break;
      }
    }

    return {'veryHigh': veryHigh, 'high': high, 'medium': medium};
  }

  Future<Map<int, ContactMatchData>> _loadContactMatchData() async {
    final contacts = <int, ContactMatchData>{};

    // Load basic contact info
    final contactRows = await _db.customSelect('''
      SELECT id, display_name FROM contacts WHERE archived_at IS NULL
    ''').get();

    for (final row in contactRows) {
      contacts[row.read<int>('id')] = ContactMatchData(
        id: row.read<int>('id'),
        displayName: row.read<String>('display_name'),
        emails: [],
        phones: [],
        socials: [],
      );
    }

    // Load emails
    final emailRows = await _db.customSelect('''
      SELECT e.contact_id, LOWER(e.email) as email
      FROM contact_emails e
      JOIN contacts c ON e.contact_id = c.id
      WHERE c.archived_at IS NULL
    ''').get();

    for (final row in emailRows) {
      final contactId = row.read<int>('contact_id');
      if (contacts.containsKey(contactId)) {
        (contacts[contactId]!.emails as List<String>).add(row.read<String>('email'));
      }
    }

    // Load phones
    final phoneRows = await _db.customSelect('''
      SELECT p.contact_id, p.phone
      FROM contact_phones p
      JOIN contacts c ON p.contact_id = c.id
      WHERE p.phone != '' AND c.archived_at IS NULL
    ''').get();

    for (final row in phoneRows) {
      final contactId = row.read<int>('contact_id');
      if (contacts.containsKey(contactId)) {
        (contacts[contactId]!.phones as List<String>).add(row.read<String>('phone'));
      }
    }

    // Load social profiles
    final socialRows = await _db.customSelect('''
      SELECT s.contact_id, LOWER(s.platform) || ':' || LOWER(s.username) as social
      FROM contact_social_profiles s
      JOIN contacts c ON s.contact_id = c.id
      WHERE c.archived_at IS NULL
    ''').get();

    for (final row in socialRows) {
      final contactId = row.read<int>('contact_id');
      if (contacts.containsKey(contactId)) {
        (contacts[contactId]!.socials as List<String>).add(row.read<String>('social'));
      }
    }

    return contacts;
  }

  Map<String, CandidatePair> _buildCandidatePairs(Map<int, ContactMatchData> contacts) {
    final pairs = <String, CandidatePair>{};

    String pairKey(int id1, int id2) {
      final a = id1 < id2 ? id1 : id2;
      final b = id1 < id2 ? id2 : id1;
      return '$a-$b';
    }

    CandidatePair getOrCreatePair(int id1, int id2) {
      final key = pairKey(id1, id2);
      if (!pairs.containsKey(key)) {
        final a = id1 < id2 ? id1 : id2;
        final b = id1 < id2 ? id2 : id1;
        pairs[key] = CandidatePair(contactId1: a, contactId2: b);
      }
      return pairs[key]!;
    }

    // Build indexes
    final emailIndex = <String, List<int>>{};
    final phoneIndex = <String, List<int>>{};
    final socialIndex = <String, List<int>>{};

    for (final contact in contacts.values) {
      for (final email in contact.emails) {
        emailIndex.putIfAbsent(email, () => []).add(contact.id);
      }
      for (final phone in contact.phones) {
        phoneIndex.putIfAbsent(phone, () => []).add(contact.id);
      }
      for (final social in contact.socials) {
        socialIndex.putIfAbsent(social, () => []).add(contact.id);
      }
    }

    // Find pairs sharing emails
    for (final entry in emailIndex.entries) {
      final contactIds = entry.value;
      if (contactIds.length > 1) {
        for (var i = 0; i < contactIds.length; i++) {
          for (var j = i + 1; j < contactIds.length; j++) {
            final pair = getOrCreatePair(contactIds[i], contactIds[j]);
            if (!pair.hasEmailMatch) {
              pair.hasEmailMatch = true;
              pair.score++;
              pair.matchedCriteria.add('email:${entry.key}');
            }
          }
        }
      }
    }

    // Find pairs sharing phones
    for (final entry in phoneIndex.entries) {
      final contactIds = entry.value;
      if (contactIds.length > 1) {
        for (var i = 0; i < contactIds.length; i++) {
          for (var j = i + 1; j < contactIds.length; j++) {
            final pair = getOrCreatePair(contactIds[i], contactIds[j]);
            if (!pair.hasPhoneMatch) {
              pair.hasPhoneMatch = true;
              pair.score++;
              pair.matchedCriteria.add('phone:${entry.key}');
            }
          }
        }
      }
    }

    // Find pairs sharing social profiles
    for (final entry in socialIndex.entries) {
      final contactIds = entry.value;
      if (contactIds.length > 1) {
        for (var i = 0; i < contactIds.length; i++) {
          for (var j = i + 1; j < contactIds.length; j++) {
            final pair = getOrCreatePair(contactIds[i], contactIds[j]);
            if (!pair.hasSocialMatch) {
              pair.hasSocialMatch = true;
              pair.score++;
              pair.matchedCriteria.add('social:${entry.key}');
            }
          }
        }
      }
    }

    // Check name matches for existing pairs
    for (final pair in pairs.values) {
      final contact1 = contacts[pair.contactId1]!;
      final contact2 = contacts[pair.contactId2]!;
      if (NameMatchingService.namesMatch(contact1.displayName, contact2.displayName)) {
        pair.hasNameMatch = true;
        pair.score++;
        pair.matchedCriteria.add('name');
      }
    }

    return pairs;
  }

  List<Map<String, dynamic>> _groupConnectedContacts(Map<String, CandidatePair> pairs) {
    final uf = UnionFind();
    final groupMetadata = <String, Map<String, dynamic>>{};

    for (final pair in pairs.values) {
      final confidence = determineConfidence(
        hasEmailMatch: pair.hasEmailMatch,
        hasPhoneMatch: pair.hasPhoneMatch,
        hasSocialMatch: pair.hasSocialMatch,
        hasNameMatch: pair.hasNameMatch,
        score: pair.score,
      );
      if (confidence == null) continue;

      uf.union(pair.contactId1, pair.contactId2);
      groupMetadata['${pair.contactId1}-${pair.contactId2}'] = {
        'confidence': confidence,
        'matchedCriteria': pair.matchedCriteria,
        'score': pair.score,
      };
    }

    final connectedGroups = uf.getGroups();
    final scoredGroups = <Map<String, dynamic>>[];

    for (final entry in connectedGroups.entries) {
      final contactIds = entry.value;
      if (contactIds.length < 2) continue;

      String bestConfidence = 'medium';
      int maxScore = 0;
      final allCriteria = <String>{};

      for (var i = 0; i < contactIds.length; i++) {
        for (var j = i + 1; j < contactIds.length; j++) {
          final id1 = contactIds[i] < contactIds[j] ? contactIds[i] : contactIds[j];
          final id2 = contactIds[i] < contactIds[j] ? contactIds[j] : contactIds[i];
          final key = '$id1-$id2';
          final metadata = groupMetadata[key];
          if (metadata != null) {
            if (metadata['confidence'] == 'very_high') {
              bestConfidence = 'very_high';
            } else if (metadata['confidence'] == 'high' && bestConfidence != 'very_high') {
              bestConfidence = 'high';
            }
            if (metadata['score'] > maxScore) {
              maxScore = metadata['score'] as int;
            }
            allCriteria.addAll((metadata['matchedCriteria'] as List<String>).cast<String>());
          }
        }
      }

      scoredGroups.add({
        'contactIds': contactIds..sort(),
        'confidence': bestConfidence,
        'matchedCriteria': allCriteria.toList(),
        'score': maxScore,
      });
    }

    return scoredGroups;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
flutter test test/services/deduplication_service_test.dart
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: port deduplication service to Dart

- Union-Find algorithm for grouping connected contacts
- Confidence levels: very_high, high, medium
- Support for email, phone, address, social duplicate detection
- Smart recommended duplicates with multi-field matching

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: UI Components (Week 4-8)

### Task 3.1: Set Up App Shell with Navigation

**Files:**
- Create: `lib/app.dart`
- Create: `lib/main.dart`
- Create: `lib/ui/shell/app_shell.dart`
- Create: `lib/ui/shell/sidebar.dart`
- Create: `lib/routing/router.dart`

(Detailed implementation for each Flutter widget following the same task structure pattern...)

---

## Phase 4: Contact List & Detail Views (Week 6-8)

### Task 4.1: Create Contact List with Virtualization
### Task 4.2: Create Contact Detail View
### Task 4.3: Create Contact Edit Form

---

## Phase 5: Import & vCard Processing (Week 8-9)

### Task 5.1: Create Import Modal
### Task 5.2: Implement vCard File Processing

---

## Phase 6: Deduplication UI (Week 9-11)

### Task 6.1: Create Deduplication View
### Task 6.2: Create Duplicate Group Component
### Task 6.3: Implement Merge Preview & Conflict Resolution

---

## Phase 7: Cleanup & Archive Views (Week 11-12)

### Task 7.1: Create Cleanup View
### Task 7.2: Create Archive View

---

## Phase 8: Map View (Week 12-13)

### Task 8.1: Create Map View with flutter_map
### Task 8.2: Implement Marker Clustering

---

## Phase 9: Settings & Polish (Week 13-14)

### Task 9.1: Create Settings View
### Task 9.2: Add Theme Support
### Task 9.3: Performance Optimization

---

## Phase 10: Testing & Launch (Week 14-16)

### Task 10.1: Integration Tests
### Task 10.2: Platform-Specific Testing
### Task 10.3: Build & Release Configuration

---

## Summary

| Phase | Tasks | Duration |
|-------|-------|----------|
| 1. Project Setup | 4 tasks | 2 weeks |
| 2. Core Services | 3 tasks | 2 weeks |
| 3. UI Components | 3 tasks | 2 weeks |
| 4. Contact Views | 3 tasks | 2 weeks |
| 5. Import | 2 tasks | 1 week |
| 6. Deduplication | 3 tasks | 2 weeks |
| 7. Cleanup/Archive | 2 tasks | 1 week |
| 8. Map View | 2 tasks | 1 week |
| 9. Settings | 3 tasks | 1 week |
| 10. Testing | 3 tasks | 2 weeks |
| **Total** | **28 tasks** | **16 weeks** |

## Critical Dependencies

```
pubspec.yaml dependencies:
- flutter_riverpod: ^2.4.0
- drift: ^2.14.0
- sqlite3_flutter_libs: ^0.5.0
- go_router: ^13.0.0
- phone_numbers_parser: ^8.2.0
- file_picker: ^6.1.0
- image: ^4.1.0
- flutter_map: ^6.1.0
- google_sign_in: ^6.2.0
```

## Platform Notes

- **iOS/Android**: Full support with platform-specific file pickers
- **macOS/Windows/Linux**: Desktop support via flutter_map (OSM tiles), may need alternative for Google Maps
- **SQLite**: Works everywhere via sqlite3_flutter_libs
- **Photos**: Stored locally in app documents directory
