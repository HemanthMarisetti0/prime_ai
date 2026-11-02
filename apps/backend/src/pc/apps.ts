import type { PcAppId } from '@prime/shared';

interface AppEntry {
  name: string;
  /** Fixed PowerShell that launches the app; never built from user input. */
  launch: string;
}

/** The only applications P.R.I.M.E. may open. */
export const APP_CATALOG: Record<PcAppId, AppEntry> = {
  vscode: {
    name: 'Visual Studio Code',
    // `code` is a .cmd shim; start Code.exe next to it to avoid a console window.
    launch:
      "$shim = (Get-Command code -ErrorAction Stop).Source; Start-Process -FilePath (Join-Path (Split-Path (Split-Path $shim)) 'Code.exe')",
  },
  notepad: { name: 'Notepad', launch: "Start-Process -FilePath 'notepad.exe'" },
  calculator: { name: 'Calculator', launch: "Start-Process -FilePath 'calc.exe'" },
  explorer: { name: 'File Explorer', launch: "Start-Process -FilePath 'explorer.exe'" },
  chrome: { name: 'Google Chrome', launch: "Start-Process -FilePath 'chrome'" },
  edge: { name: 'Microsoft Edge', launch: "Start-Process -FilePath 'msedge'" },
  taskmanager: { name: 'Task Manager', launch: "Start-Process -FilePath 'taskmgr.exe'" },
  settings: { name: 'Windows Settings', launch: "Start-Process -FilePath 'ms-settings:'" },
  paint: { name: 'Paint', launch: "Start-Process -FilePath 'mspaint.exe'" },
};

export const PC_APP_IDS = Object.keys(APP_CATALOG) as PcAppId[];
