$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$exePath = Join-Path $repoRoot "apps\clicky-windows\src-tauri\target\release\clicky-windows.exe"
$screenshotPath = Join-Path $repoRoot "docs\phase2-native-smoke.png"

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Native executable not found at $exePath. Run npm run tauri:build first."
}

$resolvedExePath = (Resolve-Path -LiteralPath $exePath).Path
Get-Process clicky-windows -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $resolvedExePath } | Stop-Process -Force

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class ClickyNativeSmoke {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  public static RECT[] GetWindowRectsForProcess(int processId) {
    var rects = new List<RECT>();
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      uint windowProcessId;
      GetWindowThreadProcessId(hWnd, out windowProcessId);

      if (windowProcessId == (uint)processId && IsWindowVisible(hWnd)) {
        RECT rect;
        if (GetWindowRect(hWnd, out rect)) {
          rects.Add(rect);
        }
      }

      return true;
    }, IntPtr.Zero);

    return rects.ToArray();
  }
}
"@

function Get-OverlayRect([int]$ProcessId) {
  $deadline = (Get-Date).AddSeconds(20)
  $screenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  do {
    $rects = [ClickyNativeSmoke]::GetWindowRectsForProcess($ProcessId) | Where-Object {
      $width = $_.Right - $_.Left
      $height = $_.Bottom - $_.Top
      $width -ge ([Math]::Floor($screenBounds.Width * 0.85)) -and $height -ge ([Math]::Floor($screenBounds.Height * 0.85))
    }

    if ($rects.Count -gt 0) {
      return $rects | Select-Object -First 1
    }

    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)

  throw "Could not find a visible Clicky overlay window for process $ProcessId."
}

[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(640, 420)

$proc = Start-Process -FilePath $exePath -PassThru

try {
  Start-Sleep -Seconds 12

  if ($proc.HasExited) {
    throw "clicky-windows.exe exited during native smoke test with code $($proc.ExitCode)."
  }

  $firstRect = Get-OverlayRect -ProcessId $proc.Id

  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(1000, 620)
  Start-Sleep -Seconds 2

  $secondRect = Get-OverlayRect -ProcessId $proc.Id
  $firstWidth = $firstRect.Right - $firstRect.Left
  $firstHeight = $firstRect.Bottom - $firstRect.Top
  $secondWidth = $secondRect.Right - $secondRect.Left
  $secondHeight = $secondRect.Bottom - $secondRect.Top
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds

  if ($firstWidth -lt [Math]::Floor($bounds.Width * 0.85) -or $firstHeight -lt [Math]::Floor($bounds.Height * 0.85)) {
    throw "Overlay window is not full-screen enough. Rect: $firstWidth x $firstHeight. Screen: $($bounds.Width) x $($bounds.Height)."
  }

  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  Write-Host "Phase 2 native smoke passed. Process ID: $($proc.Id). Full-screen overlay rect stayed available at $($secondRect.Left),$($secondRect.Top), $secondWidth x $secondHeight. Screenshot: $screenshotPath"
} finally {
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}
