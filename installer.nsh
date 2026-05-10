; Runs before files are installed — removes leftover asar artifacts from
; previous builds so Electron always loads the current app/ directory.
!macro preInit
  ; Delete old asar archive and its unpacked companion if they exist
  RMDir /r "$INSTDIR\resources\app.asar"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
!macroend
