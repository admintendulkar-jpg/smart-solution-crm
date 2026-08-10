param([string]$Identifier = "9000000003", [string]$IdentifierType = "phone", [string]$PhoneLabel = "Arun Kumar")

$ErrorActionPreference = "Stop"
$log = "$env:TEMP\sscrm-server.log"

function Get-Otp([string]$identifier) {
  Invoke-RestMethod -Uri "http://localhost:4000/api/auth/request-otp" -Method Post -ContentType "application/json" -Body (@{identifier=$identifier; identifierType=$IdentifierType} | ConvertTo-Json) | Out-Null
  Start-Sleep -Milliseconds 400
  $line = Get-Content $log | Where-Object { $_ -like "*Login OTP for $PhoneLabel*" } | Select-Object -Last 1
  $m = [regex]::Match($line, '(\d{6})\s*$')
  return $m.Groups[1].Value
}

function Login([string]$identifier) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $otp = Get-Otp $identifier
  $body = @{identifier=$identifier; otp=$otp} | ConvertTo-Json
  Invoke-RestMethod -Uri "http://localhost:4000/api/auth/verify-otp" -Method Post -ContentType "application/json" -Body $body -WebSession $session | Out-Null
  return $session
}

$s = Login $Identifier
$me = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/me" -WebSession $s
Write-Output "LOGIN_OK: $($me.user.name) ($($me.user.role))"

$q = Invoke-RestMethod -Uri "http://localhost:4000/api/leads/mine" -WebSession $s
Write-Output "QUEUE: $($q.leads.Count) leads"

$lead = $q.leads | Where-Object { $_.status -eq "New" } | Select-Object -First 1
if ($lead) {
  $call = @{outcome="Connected"; durationSec=125; note="Interested in ATS Resume, asked pricing"} | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "http://localhost:4000/api/leads/$($lead.id)/call" -Method Post -ContentType "application/json" -Body $call -WebSession $s
  Write-Output "CALL: Connected -> $($r.status)"

  $fu = @{outcome="Call Back Later"; followUpAt=(Get-Date).AddHours(5).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"); note="Call back in evening"} | ConvertTo-Json
  $r2 = Invoke-RestMethod -Uri "http://localhost:4000/api/leads/$($lead.id)/call" -Method Post -ContentType "application/json" -Body $fu -WebSession $s
  Write-Output "CALL: Call Back Later -> $($r2.status)"

  $conv = @{service="ATS Resume"; packagePlan="ATS Resume - Premium"; amount=2499; whatsapp="9000000003"} | ConvertTo-Json
  $r3 = Invoke-RestMethod -Uri "http://localhost:4000/api/leads/$($lead.id)/convert" -Method Post -ContentType "application/json" -Body $conv -WebSession $s
  Write-Output "CONVERT: client=$($r3.clientId)"
} else {
  Write-Output "SKIP: no New lead to exercise"
}
