Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

!define APPNAME "MDA Lab"
!define APPVER "0.7.28"
!define EXENAME "MDA Lab.exe"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MDALab"

Name "${APPNAME}"
OutFile "MDA-Lab-Setup-${APPVER}.exe"
InstallDir "$LOCALAPPDATA\Programs\MDA Lab"
InstallDirRegKey HKCU "Software\MDALab" "InstallDir"
RequestExecutionLevel user
BrandingText "${APPNAME} ${APPVER}"

VIProductVersion "0.7.28.0"
VIAddVersionKey /LANG=1049 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1049 "FileDescription" "Установка ${APPNAME}"
VIAddVersionKey /LANG=1049 "FileVersion" "${APPVER}"
VIAddVersionKey /LANG=1049 "ProductVersion" "${APPVER}"
VIAddVersionKey /LANG=1049 "LegalCopyright" "${APPNAME}"

!define MUI_ICON "stage\icon.ico"
!define MUI_UNICON "stage\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить MDA Lab"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Section "Install"
  ; закрыть запущенную программу, чтобы обновить файлы
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  SetOutPath "$INSTDIR"
  File /r "stage\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Удалить ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\icon.ico" 0
  WriteRegStr HKCU "Software\MDALab" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${APPVER}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\MDA Lab.exe"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vulkan-1.dll"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\MDALab"
SectionEnd
