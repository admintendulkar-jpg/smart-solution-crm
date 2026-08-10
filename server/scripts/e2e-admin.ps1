param([string]$Identifier = "9000000001", [string]$PhoneLabel = "Karthik R")

$ErrorActionPreference = "Stop"
$log = "$env:TEMP\sscrm-server.log"

Invoke-RestMethod -Uri "http://localhost:4000/api/auth/request-otp" -Method Post -ContentType "application/json" -Body (@{identifier=$Identifier; identifierType="phone"} | ConvertTo-Json) | Out-Null
Start-Sleep -Milliseconds 400
$line = Get-Content $log | Where-Object { $_ -like "*Login OTP for $PhoneLabel*" } | Select-Object -Last 1
$otp = [regex]::Match($line, '(\d{6})\s*$').Groups[1].Value

$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Uri "http://localhost:4000/api/auth/verify-otp" -Method Post -ContentType "application/json" -Body (@{identifier=$Identifier; otp=$otp} | ConvertTo-Json) -WebSession $s | Out-Null
$me = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/me" -WebSession $s
Write-Output "LOGIN_OK: $($me.user.name) ($($me.user.role))"

$dash = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/dashboard" -WebSession $s
Write-Output "DASH: open=$($dash.totals.openLeads) unassigned=$($dash.totals.unassigned) dups=$($dash.totals.pendingDuplicates) revenue=$($dash.totals.revenueConfirmed)"

$users = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/users" -WebSession $s
Write-Output "USERS: $($users.users.Count) total"

$preview = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/split/preview" -WebSession $s
Write-Output "SPLIT_PREVIEW: pool=$($preview.pool) quota=$($preview.quota) reps=$($preview.reps.Count)"

$settings = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/settings" -WebSession $s
Write-Output "SETTINGS: quota=$($settings.settings.daily_lead_quota) enabled=$($settings.settings.lead_split_enabled)"

$csv = "name,phone,email,whatsapp,source,service`nTest Kumar,9876543210,testkumar@gmail.com,9876543210,Website,ATS Resume`nTest Kumar2,9876543211,,,Referral,Job Support`nTest Kumar,9876543210,,,Website,ATS Resume"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($csv)
$file = "$env:TEMP\leads-test.csv"
[System.IO.File]::WriteAllBytes($file, $bytes)
$cookie = ($s.Cookies.GetCookies('http://localhost:4000') | ForEach-Object { "$($_.Name)=$($_.Value)" })
$impRaw = curl.exe -s -b $cookie -F "file=@$file" "http://localhost:4000/api/admin/sync/import/csv"
Write-Output "IMPORT_RAW: $impRaw"
$imp = $impRaw | ConvertFrom-Json
Write-Output "IMPORT: total=$($imp.total) imported=$($imp.imported) duplicates=$($imp.duplicates)"

$batches = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/sync/import/batches" -WebSession $s
Write-Output "BATCHES: $($batches.batches.Count)"

$allLeads = Invoke-RestMethod -Uri "http://localhost:4000/api/leads" -WebSession $s
$leadId = ($allLeads.leads | Where-Object { $_.status -eq "New" } | Select-Object -First 1).id
Write-Output "TARGET_LEAD: $leadId"

$user = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/users?role=sales" -WebSession $s
$salesId = $user.users[0].id
$assign = Invoke-RestMethod -Uri "http://localhost:4000/api/leads/$leadId/assign" -Method Post -ContentType "application/json" -Body (@{userId=$salesId} | ConvertTo-Json) -WebSession $s
Write-Output "ASSIGN: $($assign.success)"

$preview = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/split/preview" -WebSession $s
Write-Output "SPLIT_PREVIEW: pool=$($preview.pool) quota=$($preview.quota) reps=$($preview.reps.Count)"

$audit = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/audit?limit=5" -WebSession $s
Write-Output "AUDIT: latest=$($audit.entries[0].action) by $($audit.entries[0].user_name)"

$status = Invoke-RestMethod -Uri "http://localhost:4000/api/admin/sync/sheets/status" -WebSession $s
Write-Output "SHEETS: configured=$($status.configured)"

try { Invoke-RestMethod -Uri "http://localhost:4000/api/leads/mine" -WebSession $s | Out-Null; Write-Output "LEADS_MINE: super admin can view (expected)" } catch { Write-Output "LEADS_MINE: $($_.Exception.Message)" }
