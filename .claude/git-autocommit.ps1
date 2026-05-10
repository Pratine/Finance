Set-Location "C:\Users\pratine\Desktop\Finance"

git add -A

$files = git diff --cached --name-only 2>$null
if (-not $files) { exit 0 }

$names = ($files | ForEach-Object { Split-Path $_ -Leaf }) -join ', '
if ($names.Length -gt 72) { $names = $names.Substring(0, 69) + '...' }
$msg = "Update $names"

git commit -m $msg
git push origin main
