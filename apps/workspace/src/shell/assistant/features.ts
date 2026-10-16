/**
 * Feature flags for the assistant panel's presentation (docs/modules/design-system/assistant.md).
 *
 * The controls exist in the interface architecture but stay disabled until their backends exist. A disabled
 * control explains why; none of them pretends to work. Turning a flag on requires the integration listed with it.
 */
export const ASSISTANT_FEATURES = {
  /**
   * File attachments (Plus menu, paperclip). Needs the project file hand-off (CR-PM-SDK-4): an SDK service to
   * upload a file into project storage and pass a stable file reference with the message, plus server-side
   * content extraction and the access policy for attached data.
   */
  attachments: false,
  /**
   * Dictation: speech transcribed into the composer. Needs a speech-to-text service behind the assistant API
   * (provider-neutral, server-held credentials, audit like other model calls) and microphone permission handling.
   */
  dictation: false,
  /**
   * Live voice: continuous two-way conversation. Needs a realtime voice session in the assistant service
   * (streaming audio both ways, turn-taking, interruption) that executes operations through the same proposal
   * and Apply path as typed messages.
   */
  liveVoice: false,
} as const

export const UNAVAILABLE = {
  attachments: 'Attaching files is not available yet: it needs the project file hand-off (CR-PM-SDK-4).',
  dictation: 'Dictation is not available yet: no speech-to-text service is connected.',
  liveVoice: 'Live voice conversation is not available yet: no realtime voice service is connected.',
} as const
