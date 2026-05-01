<?php

declare(strict_types=1);

/*
 * Hostinger cron target:
 * 0 2 * * * /usr/bin/php /home/USERNAME/domains/YOUR_DOMAIN/public_html/api/scripts/generate_daily_puzzle.php >> /home/USERNAME/daily-puzzle.log 2>&1
 *
 * Required environment variables:
 * - OPENAI_API_KEY
 * - NEWS_API_KEY
 *
 * Optional environment variables:
 * - OPENAI_MODEL (default: gpt-4.1-mini)
 * - DAILY_TIMEZONE (default: America/New_York)
 * - DAILY_NEWS_COUNTRY (default: us)
 * - DAILY_CREATED_BY (default: System)
 */

const DATA_DIR = __DIR__ . '/../data';
const DAILY_PUZZLES_FILE = DATA_DIR . '/daily-puzzles.json';
const DAILY_PROMPT_FILE = DATA_DIR . '/daily-puzzle.prompt.json';
const DAILY_PROMPT_LOG_DIR = DATA_DIR . '/daily-prompt-logs';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const NEWS_API_URL = 'https://newsapi.org/v2/top-headlines';

function fail(string $message, int $code = 1): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit($code);
}

function readJsonFile(string $path, string $label): mixed
{
    if (!is_file($path)) {
        fail($label . ' not found: ' . $path);
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        fail('Unable to read ' . $label . ': ' . $path);
    }

    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail('Malformed JSON in ' . $label . ': ' . json_last_error_msg());
    }

    return $decoded;
}

function writeJsonFile(string $path, array $data): void
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        fail('Failed to encode JSON for ' . $path);
    }

    if (file_put_contents($path, $json . PHP_EOL, LOCK_EX) === false) {
        fail('Failed to write file: ' . $path);
    }
}

function renderTemplate(string $template, array $variables): string
{
    return preg_replace_callback('/\{\{(\w+)\}\}/', function ($matches) use ($variables) {
        $key = $matches[1];
        return array_key_exists($key, $variables) ? (string) $variables[$key] : '';
    }, $template) ?? $template;
}

function httpGetJson(string $url, array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        fail('HTTP GET failed: ' . $error);
    }

    $decoded = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail('HTTP GET returned invalid JSON: ' . json_last_error_msg());
    }

    if ($status < 200 || $status >= 300) {
        fail('HTTP GET failed with status ' . $status . ': ' . ($decoded['message'] ?? $response));
    }

    return $decoded;
}

function httpPostJson(string $url, array $payload, array $headers = []): array
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        fail('Failed to encode HTTP POST payload.');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        fail('HTTP POST failed: ' . $error);
    }

    $decoded = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail('HTTP POST returned invalid JSON: ' . json_last_error_msg());
    }

    if ($status < 200 || $status >= 300) {
        fail('HTTP POST failed with status ' . $status . ': ' . ($decoded['error']['message'] ?? $response));
    }

    return $decoded;
}

function fetchTrendingTopic(string $apiKey, string $country): array
{
    $query = http_build_query([
        'country' => $country,
        'pageSize' => 15,
    ]);

    $payload = httpGetJson(NEWS_API_URL . '?' . $query, [
        'X-Api-Key: ' . $apiKey,
    ]);

    $articles = is_array($payload['articles'] ?? null) ? $payload['articles'] : [];
    foreach ($articles as $article) {
        $title = trim((string) ($article['title'] ?? ''));
        $description = trim((string) ($article['description'] ?? ''));
        $source = trim((string) ($article['source']['name'] ?? ''));
        if ($title === '') {
            continue;
        }

        return [
            'topic' => $title,
            'summary' => $description !== '' ? $description : $title,
            'source' => $source,
            'url' => trim((string) ($article['url'] ?? '')),
        ];
    }

    fail('No usable trending topic found from NewsAPI.');
}

function validatePuzzle(array $puzzle, string $date, array $existingAnswers): array
{
    $title = trim((string) ($puzzle['title'] ?? ''));
    $answer = trim((string) ($puzzle['answer'] ?? ''));
    $gameName = trim((string) ($puzzle['gameName'] ?? ''));
    $hints = $puzzle['hints'] ?? null;

    if (($puzzle['date'] ?? '') !== $date) {
        fail('Generated puzzle date does not match target date.');
    }
    if ($gameName === '') {
        $gameName = 'Daily Puzzle - ' . $date;
    }
    if ($title === '' || $answer === '') {
        fail('Generated puzzle is missing title or answer.');
    }
    if (!is_array($hints) || count($hints) !== 5) {
        fail('Generated puzzle must contain exactly 5 hints.');
    }

    $cleanHints = [];
    foreach ($hints as $hint) {
        $cleanHint = trim((string) $hint);
        if ($cleanHint === '') {
            fail('Generated puzzle contains an empty hint.');
        }
        $cleanHints[] = $cleanHint;
    }

    if (stripos($title, $answer) !== false) {
        fail('Generated title reveals the answer.');
    }

    $normalizedAnswer = mb_strtolower($answer, 'UTF-8');
    foreach ($existingAnswers as $existing) {
        if ($normalizedAnswer === mb_strtolower(trim((string) $existing), 'UTF-8')) {
            fail('Generated answer duplicates an existing daily answer: ' . $answer);
        }
    }

    return [
        'date' => $date,
        'gameName' => $gameName,
        'title' => $title,
        'answer' => $answer,
        'hints' => $cleanHints,
    ];
}

$timezone = getenv('DAILY_TIMEZONE') ?: 'America/New_York';
$newsCountry = getenv('DAILY_NEWS_COUNTRY') ?: 'us';
$createdBy = getenv('DAILY_CREATED_BY') ?: 'System';
$openAiApiKey = trim((string) getenv('OPENAI_API_KEY'));
$newsApiKey = trim((string) getenv('NEWS_API_KEY'));
$model = trim((string) getenv('OPENAI_MODEL')) ?: 'gpt-4.1-mini';

if ($openAiApiKey === '') {
    fail('OPENAI_API_KEY is required.');
}
if ($newsApiKey === '') {
    fail('NEWS_API_KEY is required.');
}

try {
    $now = new DateTimeImmutable('now', new DateTimeZone($timezone));
} catch (Throwable $e) {
    fail('Invalid timezone: ' . $timezone);
}
$targetDate = $now->format('Y-m-d');

$puzzles = readJsonFile(DAILY_PUZZLES_FILE, 'daily puzzles file');
if (!is_array($puzzles)) {
    fail('Daily puzzles file must contain a top-level array.');
}

foreach ($puzzles as $existingPuzzle) {
    if (($existingPuzzle['date'] ?? null) === $targetDate) {
        fwrite(STDOUT, 'Daily puzzle already exists for ' . $targetDate . PHP_EOL);
        exit(0);
    }
}

$promptConfig = readJsonFile(DAILY_PROMPT_FILE, 'daily prompt file');
if (!is_array($promptConfig) || !isset($promptConfig['promptTemplate'])) {
    fail('Daily prompt file must contain a promptTemplate field.');
}

$topic = fetchTrendingTopic($newsApiKey, $newsCountry);
$existingAnswers = array_values(array_filter(array_map(
    fn(array $entry): string => trim((string) ($entry['answer'] ?? '')),
    array_filter($puzzles, 'is_array')
)));

$prompt = renderTemplate((string) $promptConfig['promptTemplate'], [
    'Date' => $targetDate,
    'Topic' => $topic['topic'],
    'TopicSummary' => $topic['summary'],
    'GamePrompt' => (string) ($promptConfig['game_prompt'] ?? ''),
    'TitlePrompt' => (string) ($promptConfig['title_prompt'] ?? ''),
    'CluesPrompt' => (string) ($promptConfig['clues_prompt'] ?? ''),
    'ExistingAnswersInstruction' => $existingAnswers ? implode(' | ', $existingAnswers) : 'None yet.',
]);

if (!is_dir(DAILY_PROMPT_LOG_DIR) && !mkdir(DAILY_PROMPT_LOG_DIR, 0775, true) && !is_dir(DAILY_PROMPT_LOG_DIR)) {
    fail('Failed to create daily prompt log directory.');
}
$promptLogPath = DAILY_PROMPT_LOG_DIR . '/' . $targetDate . '.prompt.txt';
file_put_contents($promptLogPath, $prompt . PHP_EOL, LOCK_EX);

$response = httpPostJson(OPENAI_URL, [
    'model' => $model,
    'response_format' => ['type' => 'json_object'],
    'messages' => [
        [
            'role' => 'system',
            'content' => 'You create fair, news-aware word puzzles and return valid JSON only.',
        ],
        [
            'role' => 'user',
            'content' => $prompt,
        ],
    ],
    'temperature' => 0.7,
], [
    'Authorization: Bearer ' . $openAiApiKey,
]);

$content = trim((string) ($response['choices'][0]['message']['content'] ?? ''));
if ($content === '') {
    fail('OpenAI returned empty content.');
}

$generated = json_decode($content, true);
if (!is_array($generated) || json_last_error() !== JSON_ERROR_NONE) {
    fail('OpenAI returned invalid JSON content: ' . json_last_error_msg());
}

$validated = validatePuzzle($generated, $targetDate, $existingAnswers);
$validated['createdBy'] = $createdBy;

$puzzles[] = $validated;
usort($puzzles, fn(array $a, array $b): int => strcmp((string) $a['date'], (string) $b['date']));
writeJsonFile(DAILY_PUZZLES_FILE, $puzzles);

fwrite(STDOUT, 'Created daily puzzle for ' . $targetDate . ' using topic: ' . $topic['topic'] . PHP_EOL);
