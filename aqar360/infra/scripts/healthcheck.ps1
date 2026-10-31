param([string]$BaseUrl = 'http://staging.localhost:8080')
$ErrorActionPreference = 'Stop'
$timer = [Diagnostics.Stopwatch]::StartNew()
try {
    $base = [Uri]$BaseUrl
    $headers = @{}
    $requestUri = "$BaseUrl/api/method/ping"
    if ($base.Host -eq "staging.localhost") {
        $headers.Host = "staging.localhost"
        $requestUri = "http://127.0.0.1:$($base.Port)/api/method/ping"
    }
    $response = Invoke-RestMethod -Uri $requestUri -Headers $headers -NoProxy -TimeoutSec 20
    if ($response.message -ne 'pong') { throw 'Unexpected health response' }
    @{service='aqar360';status='ok';latency_ms=$timer.ElapsedMilliseconds;checked_at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
} catch {
    @{service='aqar360';status='failed';checked_at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
    exit 1
}


