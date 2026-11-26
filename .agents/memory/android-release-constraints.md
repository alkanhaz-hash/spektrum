---
name: Android release constraints
description: Background notification/audio policy and safe native optimization boundaries.
---
SPEKTRUM currently receives remote push notifications and supports user-started background chapter playback; it does not schedule local notification alarms or record microphone audio.

**Why:** Expo SDK 54 combines a reboot receiver from notifications with playback/microphone foreground services from audio. Google Play can flag the combination even without a boot-to-audio code path (Expo upstream issue 41627).

**How to apply:** Preserve FCM delivery, notification handling, and playback services. Reboot rescheduling is unnecessary only while there are no local scheduled notifications. If scheduling or recording is introduced, revisit this policy rather than silently restoring restricted components.

Native optimization must retain the Expo/JNI classes and members required at startup.

**Why:** Earlier project history records a ClassNotFoundException after class stripping. Disabling optimization globally avoids that crash but fails Play's DEX quality expectations.

**How to apply:** Keep the installed SDK's reflection/JNI contracts while allowing optimization of other code. Verify actual AAB class definitions, permission declarations, and R8 metadata; source flags and successful compilation alone do not prove native runtime safety or Play acceptance.
