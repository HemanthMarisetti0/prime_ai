// PowerShell + C# interop for the Windows Core Audio endpoint (default playback device).
// Only fixed actions are generated below; no user text is ever interpolated into the script.

const AUDIO_TYPE = String.raw`
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int f();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

public class PrimeAudio {
  static IAudioEndpointVolume Endpoint() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    IAudioEndpointVolume volume = null;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, 0, out volume));
    return volume;
  }
  public static float Volume {
    get { float v = -1; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, value)), Guid.Empty)); }
  }
  public static bool Mute {
    get { bool m = false; Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Endpoint().SetMute(value, Guid.Empty)); }
  }
}
`;

export type VolumeAction =
  | { type: 'get' }
  | { type: 'set'; level: number }
  | { type: 'change'; delta: number }
  | { type: 'mute' }
  | { type: 'unmute' };

function actionScript(action: VolumeAction): string {
  // Numbers are validated and clamped before being written into the script.
  const pct = (n: number) => Math.round(Math.max(-100, Math.min(100, n))) / 100;
  switch (action.type) {
    case 'get':
      return '';
    case 'set':
      return `[PrimeAudio]::Volume = ${pct(action.level)}; if (${pct(action.level)} -gt 0) { [PrimeAudio]::Mute = $false }`;
    case 'change':
      return `[PrimeAudio]::Volume = [PrimeAudio]::Volume + (${pct(action.delta)}); if (${pct(action.delta)} -gt 0) { [PrimeAudio]::Mute = $false }`;
    case 'mute':
      return '[PrimeAudio]::Mute = $true';
    case 'unmute':
      return '[PrimeAudio]::Mute = $false';
  }
}

/** Full script: load the type (once per process), apply the action, print "<percent>|<muted>". */
export function buildAudioScript(action: VolumeAction): string {
  return [
    `if (-not ('PrimeAudio' -as [type])) { Add-Type -TypeDefinition @'\n${AUDIO_TYPE}\n'@ }`,
    actionScript(action),
    `'{0}|{1}' -f [math]::Round([PrimeAudio]::Volume * 100), [PrimeAudio]::Mute`,
  ].join('\n');
}
