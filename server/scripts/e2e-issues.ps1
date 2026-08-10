param()

$ErrorActionPreference = "Stop"
$base = "http://localhost:5173"

function New-OTPSession([string]$identifier) {
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $req = Invoke-WebRequest -Uri "$base/api/auth/request-otp" -Method Post -ContentType "application/json" -Body (@{identifier=$identifier; identifierType="phone"} | ConvertTo-Json) -UseBasicParsing
  $v = Invoke-RestMethod -Uri "$base/api/auth/verify-otp" -Method Post -ContentType "application/json" -Body (@{identifier=$identifier; otp="123456"} | ConvertTo-Json) -WebSession $s
  if (-not $v.success) { throw "OTP login failed for $identifier" }
  return $s
}

Write-Output "=== 1. LOGOUT TEST (owner) ==="
$s = New-OTPSession "9000000001"
$me1 = Invoke-RestMethod -Uri "$base/api/auth/me" -WebSession $s
Write-Output "logged in as: $($me1.user.name)"

$out = Invoke-RestMethod -Uri "$base/api/auth/logout" -Method Post -WebSession $s
Write-Output "logout response: $($out.success)"

try {
  Invoke-RestMethod -Uri "$base/api/auth/me" -WebSession $s | Out-Null
  Write-Output "FAIL: still authenticated after logout"
} catch {
  Write-Output "OK: session dead after logout ($($_.Exception.Response.StatusCode.value__))"
}

Write-Output ""
Write-Output "=== 2. UPLOAD + ASSIGN TEST (fresh CSV) ==="
$s2 = New-OTPSession "9000000001"
$csv = "name,phone,email,whatsapp,source,service`nFresh Lead One,9890000001,fresh1@gmail.com,9890000001,Meta Ads,ATS Resume`nFresh Lead Two,9890000002,fresh2@gmail.com,,Google Ads,Job Support"
$file = "$env:TEMP\fresh-leads.csv"
[System.IO.File]::WriteAllBytes($file, [System.Text.Encoding]::UTF8.GetBytes($csv))
$cookie = ($s2.Cookies.GetCookies($base) | ForEach-Object { "$($_.Name)=$($_.Value)" })
$imp = curl.exe -s -b $cookie -F "file=@$file" "$base/api/admin/sync/import/csv" | ConvertFrom-Json
Write-Output "import: total=$($imp.total) imported=$($imp.imported) dup=$($imp.duplicates) err=$($imp.errors)"

$pv = Invoke-RestMethod -Uri "$base/api/admin/split/preview" -WebSession $s2
Write-Output "pre-split: pool=$($pv.pool) reps=$($pv.reps.Count) enabled=$($pv.enabled)"

$run = Invoke-RestMethod -Uri "$base/api/admin/split/run" -Method Post -ContentType "application/json" -Body '{}' -WebSession $s2
Write-Output "split ran: assigned=$($run.assigned)"

$pv2 = Invoke-RestMethod -Uri "$base/api/admin/split/preview" -WebSession $s2
Write-Output "post-split pool: $($pv2.pool)"

Write-Output ""
Write-Output "=== 3. SERVICE PROFILE TEST ==="
$s3 = New-OTPSession "9000000007"
$me3 = Invoke-RestMethod -Uri "$base/api/auth/me" -WebSession $s3
Write-Output "service login: $($me3.user.name) role=$($me3.user.role)"
$cl = Invoke-RestMethod -Uri "$base/api/clients/mine" -WebSession $s3
Write-Output "service clients visible: $($cl.clients.Count)"
try {
  Invoke-RestMethod -Uri "$base/api/leads/mine" -WebSession $s3 | Out-Null
  Write-Output "FAIL: service can see leads"
} catch {
  Write-Output "OK: service blocked from leads ($($_.Exception.Response.StatusCode.value__))"
}
