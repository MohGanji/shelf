export const RIDDLE_AREAS = [
  "frontend",
  "backend",
  "databases",
  "infra-devops",
  "security",
  "ai-ml",
  "llm-agents",
  "algorithms-cs",
  "distributed-systems",
];

export const RIDDLE_DIFFICULTIES = [
  "college",
  "junior",
  "intermediate",
  "senior",
  "staff-phd",
];

export const riddles = [
  {
    id: "frontend-college-001",
    area: "frontend",
    difficulty: "college",
    prompt: `Your page calls an API
from another port.

The browser sees the reply,
then refuses to hand it over.

Which browser rule
are you running into?`,
    answers: ["CORS", "Cross-Origin Resource Sharing"],
    explanation: "CORS is the browser security model that controls whether a page can read responses from another origin."
  },
  {
    id: "frontend-college-002",
    area: "frontend",
    difficulty: "college",
    prompt: `You open the site
on a phone.

Everything is tiny,
like a desktop page
seen through glass.

Which head tag
tells the browser
the screen is real?`,
    answers: ["viewport meta tag", "meta viewport", "viewport", "meta viewport tag"],
    explanation: "The viewport meta tag tells mobile browsers how to size and scale the page."
  },
  {
    id: "frontend-college-003",
    area: "frontend",
    difficulty: "college",
    prompt: `The card says two hundred pixels.

Padding arrives.
Border joins.

The box grows wider
than the number you wrote.

Which CSS setting
keeps the promise?`,
    answers: ["box-sizing: border-box", "border-box", "box sizing border box"],
    explanation: "`box-sizing: border-box` includes padding and border inside the declared width."
  },
  {
    id: "backend-college-001",
    area: "backend",
    difficulty: "college",
    prompt: `You ship a change
to a public endpoint.

Old clients wake up
with new shapes in their hands.

What strategy lets
tomorrow's contract
live beside yesterday's?`,
    answers: ["API versioning", "versioning", "versioned API", "endpoint versioning"],
    explanation: "API versioning lets breaking changes coexist with older contracts that existing clients still depend on."
  },
  {
    id: "backend-college-002",
    area: "backend",
    difficulty: "college",
    prompt: `The same profile
is fetched all morning.

The server keeps sending
the whole thing back.

What HTTP token could say:
nothing changed,
keep your copy?`,
    answers: ["ETag", "entity tag", "HTTP ETag"],
    explanation: "An ETag lets clients make conditional requests and reuse cached responses when the resource has not changed."
  },
  {
    id: "backend-college-003",
    area: "backend",
    difficulty: "college",
    prompt: `A POST arrives
with a JSON body.

Your route runs,
but the payload is empty.

The bytes reached the door.
What middleware
forgot to open them?`,
    answers: ["JSON body parser", "body parser", "express.json", "JSON parser middleware"],
    explanation: "Backend frameworks often need body parsing middleware before route handlers can read JSON request bodies."
  },
  {
    id: "databases-college-001",
    area: "databases",
    difficulty: "college",
    prompt: `The users table grows.

Login still asks
for one email,
but the database walks
row after row.

What structure gives it
a shorter path?`,
    answers: ["index", "database index", "DB index", "index on email"],
    explanation: "A database index helps queries find matching rows without scanning the whole table."
  },
  {
    id: "databases-college-002",
    area: "databases",
    difficulty: "college",
    prompt: `Money leaves one account.

Before it reaches the other,
the process dies.

What wrapper says
all of it happens,
or none of it did?`,
    answers: ["transaction", "database transaction", "SQL transaction"],
    explanation: "A transaction groups operations so they commit together or roll back together."
  },
  {
    id: "databases-college-003",
    area: "databases",
    difficulty: "college",
    prompt: `Two signup requests race.

Both want the same handle.
Both pass the app check.

What rule belongs
inside the table
so only one survives?`,
    answers: ["unique constraint", "unique index", "uniqueness constraint"],
    explanation: "A database-level unique constraint prevents duplicate values even when concurrent requests race."
  },
  {
    id: "infra-devops-college-001",
    area: "infra-devops",
    difficulty: "college",
    prompt: `You run Redis in Docker.

compose down.
compose up.

Sessions vanish.
Cached data is gone.

What did you forget
to give the container?`,
    answers: ["volume", "Docker volume", "persistent volume", "mounted volume"],
    explanation: "A Docker volume persists data outside the container lifecycle."
  },
  {
    id: "infra-devops-college-002",
    area: "infra-devops",
    difficulty: "college",
    prompt: `It works on your laptop.

On a teammate's machine,
the app boots
with blanks where secrets belong.

What portable configuration
did you forget to share?`,
    answers: ["environment variables", "env vars", ".env file", "env file"],
    explanation: "Environment variables or a documented `.env` file carry runtime configuration outside the code."
  },
  {
    id: "infra-devops-college-003",
    area: "infra-devops",
    difficulty: "college",
    prompt: `A pull request looks harmless.

Before it reaches production,
tests run on a clean machine,
not yours.

What safety line
is doing that work?`,
    answers: ["CI", "continuous integration", "CI pipeline", "continuous integration pipeline"],
    explanation: "Continuous integration runs checks automatically before changes are merged or deployed."
  },
  {
    id: "security-college-001",
    area: "security",
    difficulty: "college",
    prompt: `A database leaks.

Users should not lose
the secret they typed
months ago.

What one-way treatment
should their passwords
have received?`,
    answers: ["password hashing", "hashing", "hashed passwords", "hash passwords"],
    explanation: "Passwords should be stored as hashes, ideally with salts and a slow password hashing algorithm."
  },
  {
    id: "security-college-002",
    area: "security",
    difficulty: "college",
    prompt: `A comment box accepts text.

Someone saves a tiny script.

Now every visitor's browser
runs code they never chose.

What class of bug is this?`,
    answers: ["XSS", "cross-site scripting", "cross site scripting"],
    explanation: "Cross-site scripting happens when untrusted content is rendered as executable script in another user's browser."
  },
  {
    id: "security-college-003",
    area: "security",
    difficulty: "college",
    prompt: `The request is logged in.

It sends another user's id,
and the server obeys.

Authentication passed.
What check was missing?`,
    answers: ["authorization", "access control", "permission check", "authorization check"],
    explanation: "Authentication proves who the user is; authorization checks what that user is allowed to do."
  },
  {
    id: "ai-ml-college-001",
    area: "ai-ml",
    difficulty: "college",
    prompt: `The model studies
the practice set

until every wrinkle
feels familiar.

On fresh cases,
it stumbles.

It memorized the room,
not the road.

What has it fallen into?`,
    answers: ["overfitting", "overfit"],
    explanation: "Overfitting shows up when a model keeps improving on training data while validation performance gets worse."
  },
  {
    id: "ai-ml-college-002",
    area: "ai-ml",
    difficulty: "college",
    prompt: `No labels are given.

Still, the points gather
into neighborhoods.

You ask the machine
to find groups
before names exist.

What task is this?`,
    answers: ["clustering", "cluster analysis", "unsupervised clustering"],
    explanation: "Clustering groups similar data points without needing labeled examples."
  },
  {
    id: "ai-ml-college-003",
    area: "ai-ml",
    difficulty: "college",
    prompt: `The model says yes.
The truth says no.

The model says no.
The truth says yes.

Four little boxes
hold every kind
of right and wrong.

What table
are you reading?`,
    answers: ["confusion matrix", "confusion table", "error matrix"],
    explanation: "A confusion matrix counts true positives, false positives, true negatives, and false negatives."
  },
  {
    id: "algorithms-cs-college-001",
    area: "algorithms-cs",
    difficulty: "college",
    prompt: `The names are sorted.

You need one name,
not every name.

Each question cuts
the remaining world in half.

What search are you using?`,
    answers: ["binary search", "binary-search"],
    explanation: "Binary search repeatedly halves a sorted search space."
  },
  {
    id: "algorithms-cs-college-002",
    area: "algorithms-cs",
    difficulty: "college",
    prompt: `A map has roads
with no negative tolls.

You want the cheapest way
from one city
to all the others.

Which algorithm
takes the wheel?`,
    answers: ["Dijkstra", "Dijkstra's algorithm", "Dijkstra algorithm"],
    explanation: "Dijkstra's algorithm finds shortest paths from one source when edge weights are nonnegative."
  },
  {
    id: "algorithms-cs-college-003",
    area: "algorithms-cs",
    difficulty: "college",
    prompt: `The recursive solution works.

Then it asks
the same smaller question
again and again.

What memory trick
keeps yesterday's answer?`,
    answers: ["memoization", "memoisation"],
    explanation: "Memoization stores previous results so repeated subproblems do not need to be recomputed."
  },
  {
    id: "distributed-systems-college-001",
    area: "distributed-systems",
    difficulty: "college",
    prompt: `A payment event arrives twice.

The worker smiles twice.
The card is charged twice.

What property should make
the second knock harmless?`,
    answers: ["idempotency", "idempotence", "idempotent operation", "idempotent consumer"],
    explanation: "Idempotency means repeating the same operation has the same effect as doing it once."
  },
  {
    id: "distributed-systems-college-002",
    area: "distributed-systems",
    difficulty: "college",
    prompt: `The database has the truth.

The cache remembers yesterday.

Users keep seeing
the old answer fast.

What hard problem
is asking to be solved?`,
    answers: ["cache invalidation", "cache expiration", "cache eviction"],
    explanation: "Cache invalidation is deciding when cached data should be removed or refreshed so users do not see stale values."
  },
  {
    id: "distributed-systems-college-003",
    area: "distributed-systems",
    difficulty: "college",
    prompt: `Two servers stop hearing
each other's heartbeats.

Both believe
they should lead.

The cluster now has
two kings.

What failure is this?`,
    answers: ["split brain", "split-brain"],
    explanation: "Split brain happens when a partitioned system has multiple nodes believing they are the leader."
  },
  {
    id: "frontend-junior-001",
    area: "frontend",
    difficulty: "junior",
    prompt: `The component loads.
The API answers.

Then the API answers again.
And again.

The network tab fills
with the same request.

Which hook list
kept changing under you?`,
    answers: ["useEffect dependency array", "dependency array", "effect dependencies", "React effect dependencies"],
    explanation: "A changing or missing dependency array can make an effect run repeatedly and trigger repeated requests."
  },
  {
    id: "frontend-junior-002",
    area: "frontend",
    difficulty: "junior",
    prompt: `The modal has
a giant z-index.

Still, the header
floats above it.

Some ancestor quietly made
its own little world.

What CSS trap
are you inside?`,
    answers: ["stacking context", "CSS stacking context", "z-index stacking context"],
    explanation: "A stacking context can prevent a child from layering above elements outside that context, no matter how large its z-index is."
  },
  {
    id: "frontend-junior-003",
    area: "frontend",
    difficulty: "junior",
    prompt: `You press Enter
in a search form.

The page flashes white.
Your state disappears.

The browser did
what forms have always done.

What call did
the handler forget?`,
    answers: ["preventDefault", "event.preventDefault", "prevent default"],
    explanation: "`event.preventDefault()` stops the browser's default form submission reload when JavaScript handles the submit."
  },
  {
    id: "backend-junior-001",
    area: "backend",
    difficulty: "junior",
    prompt: `The endpoint returns
fifty posts.

For each post,
one more query
asks for its author.

Local feels fine.
Production counts the storm.

What pattern did you ship?`,
    answers: ["N+1 query", "N plus one query", "N+1 queries", "N plus 1 query"],
    explanation: "An N+1 query pattern makes one initial query and then one extra query per returned row."
  },
  {
    id: "backend-junior-002",
    area: "backend",
    difficulty: "junior",
    prompt: `The route works
for ten records.

Then a real customer
owns ten thousand.

The response grows,
the timeout follows.

What boundary did
the endpoint need?`,
    answers: ["pagination", "page limit", "limit and offset", "cursor pagination"],
    explanation: "Pagination bounds response size so large collections are returned in manageable chunks."
  },
  {
    id: "backend-junior-003",
    area: "backend",
    difficulty: "junior",
    prompt: `Your Node server
starts hashing a huge file.

Every other request
waits in silence.

The process is alive,
but one thread owns the room.

What did you block?`,
    answers: ["event loop", "Node event loop", "JavaScript event loop"],
    explanation: "CPU-heavy synchronous work can block the Node.js event loop and delay unrelated requests."
  },
  {
    id: "databases-junior-001",
    area: "databases",
    difficulty: "junior",
    prompt: `A migration adds
NOT NULL.

Deploy begins.
Old rows answer back
with empty fields.

What step should have
filled the past
before tightening the rule?`,
    answers: ["backfill", "data backfill", "backfill migration", "migration backfill"],
    explanation: "A backfill updates existing rows before a stricter constraint is added."
  },
  {
    id: "databases-junior-002",
    area: "databases",
    difficulty: "junior",
    prompt: `A user is deleted.

Their orders remain,
pointing at a ghost.

Reports now join
against someone
who no longer exists.

What table rule
should have held the link?`,
    answers: ["foreign key", "foreign key constraint", "referential integrity"],
    explanation: "A foreign key constraint preserves relationships between tables and prevents orphaned references."
  },
  {
    id: "databases-junior-003",
    area: "databases",
    difficulty: "junior",
    prompt: `A report query runs.

Writers begin to wait.
The dashboard keeps reading,
and the app grows tense.

What invisible hold
is slowing the room?`,
    answers: ["database lock", "lock", "row lock", "table lock", "locking"],
    explanation: "Database locks can make reads or writes wait while another transaction holds access to rows or tables."
  },
  {
    id: "infra-devops-junior-001",
    area: "infra-devops",
    difficulty: "junior",
    prompt: `Inside Docker,
the app calls localhost.

The database is running,
but nobody answers.

You forgot that localhost
means this container,
not the other one.

What name should
the app use?`,
    answers: ["service name", "Docker service name", "container service name", "compose service name"],
    explanation: "Containers in the same Compose network usually reach each other by service name, not by localhost."
  },
  {
    id: "infra-devops-junior-002",
    area: "infra-devops",
    difficulty: "junior",
    prompt: `The deploy turns green.

Traffic arrives
before the app
can answer honestly.

Users meet boot logs
instead of a page.

What gate should
the platform check first?`,
    answers: ["readiness probe", "readiness check", "health check", "readiness endpoint"],
    explanation: "A readiness check keeps traffic away from an instance until it is actually ready to serve."
  },
  {
    id: "infra-devops-junior-003",
    area: "infra-devops",
    difficulty: "junior",
    prompt: `CI needs a token.

You refuse to paste it
into the repo.

The pipeline still must read it
when the job runs.

Where should the secret live?`,
    answers: ["CI secrets", "repository secrets", "GitHub Actions secrets", "secret manager"],
    explanation: "CI secret storage exposes sensitive values to jobs without committing them to source control."
  },
  {
    id: "security-junior-001",
    area: "security",
    difficulty: "junior",
    prompt: `The login form works.

Then someone types
a quote,
an OR,
and a little truth.

The query believes
more than it should.

What defense belongs
between text and SQL?`,
    answers: ["parameterized queries", "prepared statements", "query parameters", "SQL parameters"],
    explanation: "Parameterized queries keep user input separate from SQL syntax and prevent injection."
  },
  {
    id: "security-junior-002",
    area: "security",
    difficulty: "junior",
    prompt: `A user is logged in.

Another site hides a form
and makes the browser
send their cookie.

The request looks real.

What attack borrowed
the user's trust?`,
    answers: ["CSRF", "cross-site request forgery", "cross site request forgery"],
    explanation: "CSRF tricks a logged-in browser into making an unwanted request using the user's existing credentials."
  },
  {
    id: "security-junior-003",
    area: "security",
    difficulty: "junior",
    prompt: `A token lands
in localStorage.

Later, a script bug
lets an attacker read
whatever JavaScript can touch.

Which cookie flag
would have kept it
away from scripts?`,
    answers: ["HttpOnly", "HttpOnly cookie", "HttpOnly flag"],
    explanation: "The HttpOnly cookie flag prevents JavaScript from reading a cookie, reducing token theft through XSS."
  },
  {
    id: "ai-ml-junior-001",
    area: "ai-ml",
    difficulty: "junior",
    prompt: `The fraud model reports
ninety-nine percent accuracy.

Then support shows
the missed fraud cases.

Almost every row
was never fraud
to begin with.

What dataset problem
fooled the metric?`,
    answers: ["class imbalance", "imbalanced classes", "imbalanced dataset", "class imbalance problem"],
    explanation: "Class imbalance can make accuracy look high while the model fails on the rare class that matters."
  },
  {
    id: "ai-ml-junior-002",
    area: "ai-ml",
    difficulty: "junior",
    prompt: `The notebook predicts well.

The API predicts nonsense.

Same model file,
different numbers
before the model
ever sees them.

What part of training
did production forget?`,
    answers: ["preprocessing pipeline", "feature preprocessing", "same preprocessing", "data preprocessing"],
    explanation: "Production must apply the same preprocessing and feature transformations used during training."
  },
  {
    id: "ai-ml-junior-003",
    area: "ai-ml",
    difficulty: "junior",
    prompt: `The experiment improves.

You run it again,
and the win disappears.

Nothing changed
except the shuffle.

What small number
would make the run
repeatable?`,
    answers: ["random seed", "seed", "random_state", "fixed seed"],
    explanation: "A fixed random seed makes randomized splits or initialization reproducible enough to compare runs."
  },
  {
    id: "algorithms-cs-junior-001",
    area: "algorithms-cs",
    difficulty: "junior",
    prompt: `The endpoint compares
every item
with every other item.

At one hundred,
it smiles.

At ten thousand,
it sinks.

What time shape
did the loop draw?`,
    answers: ["O(n^2)", "quadratic time", "n squared", "O of n squared"],
    explanation: "Nested comparisons over all pairs usually produce quadratic time complexity."
  },
  {
    id: "algorithms-cs-junior-002",
    area: "algorithms-cs",
    difficulty: "junior",
    prompt: `A graph has
unweighted edges.

You need the fewest hops,
not the prettiest path.

The search spreads outward
one ring at a time.

What traversal is this?`,
    answers: ["BFS", "breadth-first search", "breadth first search"],
    explanation: "Breadth-first search finds shortest paths by number of edges in an unweighted graph."
  },
  {
    id: "algorithms-cs-junior-003",
    area: "algorithms-cs",
    difficulty: "junior",
    prompt: `The recursive walk
goes deep.

Too deep.

The program falls
through its own call stack.

What data structure
can carry the work
by hand?`,
    answers: ["stack", "explicit stack", "manual stack"],
    explanation: "An explicit stack can replace deep recursion and avoid overflowing the call stack."
  },
  {
    id: "distributed-systems-junior-001",
    area: "distributed-systems",
    difficulty: "junior",
    prompt: `The service is down.

Every client retries
at the same second.

Recovery begins,
then the crowd
knocks it over again.

What retry habit
spreads the footsteps?`,
    answers: ["exponential backoff with jitter", "backoff with jitter", "jitter", "exponential backoff"],
    explanation: "Exponential backoff with jitter spaces retries out so clients do not stampede a recovering service."
  },
  {
    id: "distributed-systems-junior-002",
    area: "distributed-systems",
    difficulty: "junior",
    prompt: `The queue grows.

Workers keep drinking,
but the producer pours faster.

Memory rises.
Latency follows.

What pressure should tell
the sender to slow down?`,
    answers: ["backpressure", "back pressure"],
    explanation: "Backpressure lets overloaded consumers signal producers to slow down instead of buffering forever."
  },
  {
    id: "distributed-systems-junior-003",
    area: "distributed-systems",
    difficulty: "junior",
    prompt: `Service A calls B.
B is sick.

A keeps waiting,
threads pile up,
and the sickness spreads.

What breaker should open
before the whole chain falls?`,
    answers: ["circuit breaker", "circuit breaker pattern"],
    explanation: "A circuit breaker stops repeated calls to a failing dependency so the failure does not cascade."
  },
  {
    id: "frontend-intermediate-001",
    area: "frontend",
    difficulty: "intermediate",
    prompt: `The button feels slow.

Not because the click
takes long,
but because typing elsewhere
repaints half the page.

Which rendering problem
is stealing time
from unrelated work?`,
    answers: ["unnecessary re-render", "unnecessary rerender", "unnecessary re-renders", "extra render"],
    explanation: "Unnecessary re-renders make components update even when their visible output does not need to change."
  },
  {
    id: "frontend-intermediate-002",
    area: "frontend",
    difficulty: "intermediate",
    prompt: `The page paints fast.

Then it jumps.
Images arrive late,
ads claim space,
text runs away.

Which user-facing metric
counts the moving ground?`,
    answers: ["CLS", "cumulative layout shift", "layout shift"],
    explanation: "Cumulative Layout Shift measures unexpected visual movement while a page loads."
  },
  {
    id: "frontend-intermediate-003",
    area: "frontend",
    difficulty: "intermediate",
    prompt: `The app ships
one heavy bundle.

A settings page
no one opened
still rides the first load.

What split lets code
arrive only when
its route is called?`,
    answers: ["code splitting", "route-based code splitting", "lazy loading", "dynamic import"],
    explanation: "Code splitting and lazy loading keep less-used code out of the initial bundle until it is needed."
  },
  {
    id: "backend-intermediate-001",
    area: "backend",
    difficulty: "intermediate",
    prompt: `The client gives up.

The server keeps working.

Minutes later,
it writes a result
no one is waiting for.

Which signal should have
traveled with the request?`,
    answers: ["cancellation", "request cancellation", "abort signal", "cancellation token"],
    explanation: "Request cancellation lets backend work stop when the caller disconnects or no longer needs the result."
  },
  {
    id: "backend-intermediate-002",
    area: "backend",
    difficulty: "intermediate",
    prompt: `A webhook arrives twice.

The sender promised
at least once,
not exactly once.

Your database should smile
at the second copy.

What key makes
the repeat harmless?`,
    answers: ["idempotency key", "idempotency", "deduplication key", "dedupe key"],
    explanation: "An idempotency key lets the server recognize a repeated request and avoid applying the side effect twice."
  },
  {
    id: "backend-intermediate-003",
    area: "backend",
    difficulty: "intermediate",
    prompt: `The endpoint is popular.

One slow dependency
fills every worker.

Soon even cheap requests
wait behind expensive ones.

What boundary keeps
one path from eating
the whole server?`,
    answers: ["bulkhead", "bulkhead pattern", "resource isolation", "isolation pool"],
    explanation: "The bulkhead pattern isolates resources so one failing or slow dependency cannot consume all capacity."
  },
  {
    id: "databases-intermediate-001",
    area: "databases",
    difficulty: "intermediate",
    prompt: `The query has an index.

Still, it walks millions
of rows.

The filter changed shape,
and the planner chose
a worse road.

What should you read
before guessing?`,
    answers: ["query plan", "execution plan", "EXPLAIN", "EXPLAIN ANALYZE"],
    explanation: "A query plan shows how the database intends to execute a query and whether indexes are actually used."
  },
  {
    id: "databases-intermediate-002",
    area: "databases",
    difficulty: "intermediate",
    prompt: `Two jobs touch
the same rows,
but not in
the same order.

Each holds one lock.
Each waits for the other.

What circle did
the database break?`,
    answers: ["deadlock", "database deadlock"],
    explanation: "A deadlock occurs when transactions wait on each other's locks in a cycle, forcing the database to abort one."
  },
  {
    id: "databases-intermediate-003",
    area: "databases",
    difficulty: "intermediate",
    prompt: `The page says
next twenty rows.

New rows arrive
between clicks.

Offset skips one,
then shows another twice.

What paging style
follows a stable marker?`,
    answers: ["cursor pagination", "keyset pagination", "seek pagination"],
    explanation: "Cursor or keyset pagination uses a stable position marker instead of offset counts that drift as data changes."
  },
  {
    id: "infra-devops-intermediate-001",
    area: "infra-devops",
    difficulty: "intermediate",
    prompt: `A deploy rolls out.

The new pod starts,
but old traffic dies
before the new one
can breathe.

What shutdown ritual
lets requests finish
before the door closes?`,
    answers: ["graceful shutdown", "graceful termination", "termination grace period"],
    explanation: "Graceful shutdown lets an instance stop accepting new work while finishing in-flight requests."
  },
  {
    id: "infra-devops-intermediate-002",
    area: "infra-devops",
    difficulty: "intermediate",
    prompt: `CPU is calm.
Memory is calm.

Still, pods restart
when traffic spikes.

The app waits on sockets
it cannot get.

Which hidden limit
ran out first?`,
    answers: ["connection pool", "connection pool limit", "file descriptors", "connection limit"],
    explanation: "Resource limits such as connection pools or file descriptors can exhaust before CPU or memory look busy."
  },
  {
    id: "infra-devops-intermediate-003",
    area: "infra-devops",
    difficulty: "intermediate",
    prompt: `The chart turns red.

Nobody knows
which deploy did it.

Logs are loud,
metrics are lonely.

What tag should travel
with every request
and every graph?`,
    answers: ["release version", "deployment version", "version tag", "build SHA", "commit SHA"],
    explanation: "Tagging logs and metrics with a release version or commit SHA lets teams correlate regressions with deployments."
  },
  {
    id: "security-intermediate-001",
    area: "security",
    difficulty: "intermediate",
    prompt: `The token is signed.

The server trusts it.

But the user was removed
five minutes ago,
and the token still walks in.

What lifecycle problem
is waiting at the door?`,
    answers: ["token revocation", "JWT revocation", "session revocation", "revocation"],
    explanation: "Signed tokens still need a revocation or expiry strategy when access must be removed before the token expires."
  },
  {
    id: "security-intermediate-002",
    area: "security",
    difficulty: "intermediate",
    prompt: `The app escapes HTML.

Then it places user text
inside a script block.

The old shield
was built for
a different room.

What did the output need?`,
    answers: ["context-aware escaping", "contextual escaping", "output encoding", "context-aware output encoding"],
    explanation: "Output encoding must match the context, such as HTML, JavaScript, URL, or attribute contexts."
  },
  {
    id: "security-intermediate-003",
    area: "security",
    difficulty: "intermediate",
    prompt: `The API allows
one hundred requests
per minute.

An attacker brings
ten thousand accounts.

Each account behaves,
the system still drowns.

What limit was
set too narrowly?`,
    answers: ["rate limiting by user only", "global rate limit", "IP rate limit", "tenant rate limit", "distributed rate limiting"],
    explanation: "Rate limits often need multiple dimensions, not only per-user limits, to handle distributed abuse."
  },
  {
    id: "ai-ml-intermediate-001",
    area: "ai-ml",
    difficulty: "intermediate",
    prompt: `The model passed
last month's test.

This month,
customers changed,
prices changed,
habits changed.

The world moved
under the features.

What should you monitor?`,
    answers: ["data drift", "distribution drift", "feature drift", "model drift"],
    explanation: "Data drift happens when live input distributions move away from the data the model was trained or validated on."
  },
  {
    id: "ai-ml-intermediate-002",
    area: "ai-ml",
    difficulty: "intermediate",
    prompt: `The classifier catches fraud.

It also blocks
good customers.

Moving one line
trades missed thieves
for angry shoppers.

What line are you tuning?`,
    answers: ["decision threshold", "classification threshold", "threshold"],
    explanation: "A decision threshold controls the tradeoff between false positives and false negatives in a classifier."
  },
  {
    id: "ai-ml-intermediate-003",
    area: "ai-ml",
    difficulty: "intermediate",
    prompt: `Training is clean.

Serving is fast.

But the feature named
account age
means days in one place
and months in another.

What quiet mismatch
breaks the model?`,
    answers: ["training-serving skew", "training serving skew", "feature skew", "feature mismatch"],
    explanation: "Training-serving skew happens when features are computed differently during training and production serving."
  },
  {
    id: "algorithms-cs-intermediate-001",
    area: "algorithms-cs",
    difficulty: "intermediate",
    prompt: `The stream never ends.

You only need
the largest hundred.

Sorting the world
would bury the server.

What small structure
keeps the winners nearby?`,
    answers: ["heap", "priority queue", "min heap", "top-k heap"],
    explanation: "A heap or priority queue can maintain the top K items without sorting every item seen."
  },
  {
    id: "algorithms-cs-intermediate-002",
    area: "algorithms-cs",
    difficulty: "intermediate",
    prompt: `You cache answers.

Memory grows
until the process bends.

Old keys should leave
when newer ones arrive.

What policy forgets
the least recent guest?`,
    answers: ["LRU", "least recently used", "LRU cache", "least-recently-used cache"],
    explanation: "An LRU cache evicts the least recently used item when capacity is reached."
  },
  {
    id: "algorithms-cs-intermediate-003",
    area: "algorithms-cs",
    difficulty: "intermediate",
    prompt: `Words arrive
one character at a time.

Autocomplete needs
every shared beginning
to stay close.

What tree keeps
prefixes on the same path?`,
    answers: ["trie", "prefix tree"],
    explanation: "A trie stores strings by shared prefixes, which makes prefix lookup and autocomplete efficient."
  },
  {
    id: "distributed-systems-intermediate-001",
    area: "distributed-systems",
    difficulty: "intermediate",
    prompt: `The write succeeds
in one region.

Another region reads
a moment too soon.

It sees yesterday,
then catches up.

What kind of promise
did the system make?`,
    answers: ["eventual consistency", "eventually consistent"],
    explanation: "Eventual consistency allows replicas to be temporarily stale as long as they converge later."
  },
  {
    id: "distributed-systems-intermediate-002",
    area: "distributed-systems",
    difficulty: "intermediate",
    prompt: `Every service logs
its own little truth.

A request crosses five doors.

No single log
shows the whole walk.

What shared thread
should follow it?`,
    answers: ["trace id", "correlation id", "request id", "distributed tracing"],
    explanation: "A trace or correlation id ties together logs and spans from the same request across services."
  },
  {
    id: "distributed-systems-intermediate-003",
    area: "distributed-systems",
    difficulty: "intermediate",
    prompt: `The partition heals.

Two replicas return
with different truths.

Neither can simply
pretend the other
never happened.

What work begins
after the network returns?`,
    answers: ["conflict resolution", "reconciliation", "read repair", "merge conflict resolution"],
    explanation: "After a partition, replicas may need reconciliation or conflict resolution to converge on a valid state."
  },
  {
    id: "frontend-senior-001",
    area: "frontend",
    difficulty: "senior",
    prompt: `The server sends a page.

The browser wakes up
and draws it differently.

React keeps the DOM,
but warns the two worlds
do not match.

What kind of mismatch
did you ship?`,
    answers: ["hydration mismatch", "hydration error", "SSR hydration mismatch"],
    explanation: "A hydration mismatch happens when server-rendered markup differs from what the client renders on startup."
  },
  {
    id: "frontend-senior-002",
    area: "frontend",
    difficulty: "senior",
    prompt: `Two teams ship
the same shell.

One upgrades React.
One does not.

Hooks begin to fail
only where their bundles meet.

What duplicate guest
entered the page?`,
    answers: ["duplicate React", "multiple React versions", "duplicate React instance", "two React copies"],
    explanation: "Loading multiple React copies or incompatible versions can break shared component and hook behavior."
  },
  {
    id: "frontend-senior-003",
    area: "frontend",
    difficulty: "senior",
    prompt: `A checkout experiment
is decided in the browser.

The server sends one layout.
The client swaps another.

Users see the page jump
right before they pay.

Where should the flag
have been decided?`,
    answers: ["server-side flag evaluation", "server-side feature flag", "server-side experiment", "edge flag evaluation"],
    explanation: "Server-side or edge flag evaluation keeps the first render consistent for experiments that change layout."
  },
  {
    id: "backend-senior-001",
    area: "backend",
    difficulty: "senior",
    prompt: `The order is saved.

Then the process dies
before the event leaves.

The database is right.
The warehouse never hears.

What pattern keeps
the message beside
the write?`,
    answers: ["outbox pattern", "transactional outbox", "database outbox"],
    explanation: "The transactional outbox pattern stores the event with the database write so it can be published reliably after commit."
  },
  {
    id: "backend-senior-002",
    area: "backend",
    difficulty: "senior",
    prompt: `Version one pods
still serve traffic.

Version two expects
a new column.

The migration runs
between them,
and half the fleet
falls over.

What migration style
did you skip?`,
    answers: ["expand-contract migration", "expand and contract", "zero-downtime migration", "backward-compatible migration"],
    explanation: "Expand-contract migrations keep old and new application versions working while schema changes roll out safely."
  },
  {
    id: "backend-senior-003",
    area: "backend",
    difficulty: "senior",
    prompt: `A partner retries
the same payout.

Your service is careful.
The payment provider
is not.

Money leaves twice
outside your database.

What protection must cross
the external call?`,
    answers: ["idempotency key", "external idempotency key", "idempotent request", "idempotency"],
    explanation: "Idempotency must cover external side effects, not only local database writes."
  },
  {
    id: "databases-senior-001",
    area: "databases",
    difficulty: "senior",
    prompt: `A nightly report starts.

Checkout begins to crawl.
Locks stack up.

The same tables
serve money and questions.

Where should the report
have been sent?`,
    answers: ["read replica", "analytics replica", "OLAP store", "separate analytics database"],
    explanation: "Heavy analytical queries should run on replicas or analytics stores instead of competing with transactional checkout traffic."
  },
  {
    id: "databases-senior-002",
    area: "databases",
    difficulty: "senior",
    prompt: `Every new order
lands on today's partition.

One shard burns hot.
The others sit quiet.

Traffic is balanced.
The key is not.

What did you choose poorly?`,
    answers: ["partition key", "shard key", "sharding key"],
    explanation: "A poor partition or shard key can send too much traffic to one partition while others stay idle."
  },
  {
    id: "databases-senior-003",
    area: "databases",
    difficulty: "senior",
    prompt: `The user saves a profile.

Then refreshes.
The old value returns.

Reads go somewhere faster
and a little behind.

What lag did
the product forget?`,
    answers: ["replica lag", "read replica lag", "replication lag"],
    explanation: "Replica lag can make users read stale data shortly after a write if reads are routed to replicas."
  },
  {
    id: "infra-devops-senior-001",
    area: "infra-devops",
    difficulty: "senior",
    prompt: `The region goes dark.

The runbook says
fail over.

Nobody has pressed
that button in a year.

What should have happened
on a calm day?`,
    answers: ["disaster recovery drill", "DR drill", "DR test", "disaster recovery test", "failover drill", "failover test", "game day"],
    explanation: "Disaster recovery drills test failover steps before a real outage depends on them."
  },
  {
    id: "infra-devops-senior-002",
    area: "infra-devops",
    difficulty: "senior",
    prompt: `A deploy passes health checks.

Traffic moves over.
Errors climb.

The service was alive,
not useful.

What kind of check
was too shallow?`,
    answers: ["synthetic check", "end-to-end health check", "deep health check", "readiness check"],
    explanation: "A shallow health check can pass even when critical dependencies or user flows are broken."
  },
  {
    id: "infra-devops-senior-003",
    area: "infra-devops",
    difficulty: "senior",
    prompt: `Auto-scaling adds pods.

The database does not scale.
Each pod opens a pool.

Soon the database
has no sockets left.

What limit grew
with the fleet?`,
    answers: ["connection pool", "database connection pool", "connection limit", "max connections"],
    explanation: "Scaling application instances can multiply database connections until shared connection limits are exhausted."
  },
  {
    id: "security-senior-001",
    area: "security",
    difficulty: "senior",
    prompt: `A worker token leaks.

It can read buckets,
write queues,
and delete tables.

One small key
opens the whole house.

What principle was ignored?`,
    answers: ["least privilege", "principle of least privilege", "minimal privilege"],
    explanation: "Least privilege limits each credential or identity to only the access it needs, reducing blast radius."
  },
  {
    id: "security-senior-002",
    area: "security",
    difficulty: "senior",
    prompt: `The admin page
checks your login.

It forgets to check
which tenant you belong to.

One customer edits
another customer's users.

What boundary did
the code fail to enforce?`,
    answers: ["tenant isolation", "multi-tenant isolation", "tenant boundary", "authorization boundary"],
    explanation: "Multi-tenant systems must enforce tenant boundaries so authenticated users cannot access another tenant's data."
  },
  {
    id: "security-senior-003",
    area: "security",
    difficulty: "senior",
    prompt: `A dependency update
looks harmless.

It brings a child package
you never reviewed.

Production now runs code
from three names away.

What kind of risk
entered the build?`,
    answers: ["supply chain risk", "software supply chain risk", "dependency risk", "transitive dependency risk"],
    explanation: "Software supply chain risk includes vulnerabilities and compromise in direct or transitive dependencies."
  },
  {
    id: "ai-ml-senior-001",
    area: "ai-ml",
    difficulty: "senior",
    prompt: `The fraud model learns
from approved transactions.

But risky users
were already blocked,
so their outcomes
never reached the table.

What bias did
the training data inherit?`,
    answers: ["selection bias", "sample selection bias", "selection bias in training data"],
    explanation: "Selection bias appears when the training data only contains outcomes for cases the previous system allowed through."
  },
  {
    id: "ai-ml-senior-002",
    area: "ai-ml",
    difficulty: "senior",
    prompt: `The recommender learns
from clicks.

Then it shows
what it already believes
people will click.

Tomorrow's training set
echoes yesterday's ranking.

What loop did
the model enter?`,
    answers: ["feedback loop", "model feedback loop", "prediction feedback loop"],
    explanation: "Model feedback loops happen when predictions influence the future data used to evaluate or train the model."
  },
  {
    id: "ai-ml-senior-003",
    area: "ai-ml",
    difficulty: "senior",
    prompt: `A new model waits
beside the old one.

Live requests visit both.
Only the old model
speaks to users.

You compare answers
without risking checkout.

What rollout
is this?`,
    answers: ["shadow deployment", "shadow mode", "shadow testing", "dark launch"],
    explanation: "A shadow deployment sends production traffic to a new model without letting it affect users."
  },
  {
    id: "algorithms-cs-senior-001",
    area: "algorithms-cs",
    difficulty: "senior",
    prompt: `The route planner
can find perfection.

It needs minutes.
Drivers need seconds.

A good-enough path
gets them moving.

What kind of algorithm
did the product choose?`,
    answers: ["approximation algorithm", "approximation", "heuristic", "approximate algorithm"],
    explanation: "Approximation algorithms and heuristics trade exactness for speed or feasibility when exact solutions are too costly."
  },
  {
    id: "algorithms-cs-senior-002",
    area: "algorithms-cs",
    difficulty: "senior",
    prompt: `The feed cache
uses least-recently-used.

Then a bot walks
millions of old posts.

Real users lose
the hot feed
they came for.

What cache weakness
did the scan expose?`,
    answers: ["cache pollution", "LRU cache pollution", "scan pollution", "cache scan pollution"],
    explanation: "Sequential scans can pollute an LRU cache by evicting hot items with data that will not be reused."
  },
  {
    id: "algorithms-cs-senior-003",
    area: "algorithms-cs",
    difficulty: "senior",
    prompt: `The ranking job
recomputes the whole graph

after every tiny edge
arrives.

Most of the graph
never changed.

What style of algorithm
should carry yesterday forward?`,
    answers: ["incremental algorithm", "incremental computation", "dynamic algorithm", "incremental update"],
    explanation: "Incremental or dynamic algorithms update results after changes without recomputing everything from scratch."
  },
  {
    id: "distributed-systems-senior-001",
    area: "distributed-systems",
    difficulty: "senior",
    prompt: `A user changes
their email in Europe.

One second later,
America still sends
to the old address.

Both regions are healthy.
Light is just slow.

What guarantee
did this flow need?`,
    answers: ["read-after-write consistency", "read your writes", "read your own writes", "read-your-writes consistency", "read after write"],
    explanation: "Read-after-write consistency lets a user see their own recent write even when replicas are still catching up."
  },
  {
    id: "distributed-systems-senior-002",
    area: "distributed-systems",
    difficulty: "senior",
    prompt: `The payment service
starts timing out.

Every caller retries
three times at once.

The outage grows
from the medicine.

What budget should have
limited the retries?`,
    answers: ["retry budget", "retry budgeting", "retry limit", "bounded retries"],
    explanation: "Retry budgets or strict retry limits prevent callers from multiplying load during dependency failures."
  },
  {
    id: "distributed-systems-senior-003",
    area: "distributed-systems",
    difficulty: "senior",
    prompt: `Booking succeeds.

Payment succeeds.
Seat assignment fails.

No single database
owns all three steps.

What pattern keeps
the story recoverable?`,
    answers: ["saga", "saga pattern", "distributed saga"],
    explanation: "The saga pattern coordinates multi-service workflows with local transactions and compensating actions."
  },
  {
    id: "frontend-staff-phd-001",
    area: "frontend",
    difficulty: "staff-phd",
    prompt: `The tap lands.

Analytics wakes first.
A long task holds
the main thread.

The button changes late,
though the network is idle.

Which field metric
catches that delay?`,
    answers: ["INP", "Interaction to Next Paint", "interaction-to-next-paint"],
    explanation: "Interaction to Next Paint measures how long user interactions wait before the page visually responds."
  },
  {
    id: "frontend-staff-phd-002",
    area: "frontend",
    difficulty: "staff-phd",
    prompt: `The edge cache is fast.

Too fast.

One user's country
chooses a price,
then another country
receives the same page.

What missing key
made speed unsafe?`,
    answers: ["cache key", "Vary header", "cache variation", "cache vary"],
    explanation: "Cache keys and Vary headers must include the request properties that change the response."
  },
  {
    id: "frontend-staff-phd-003",
    area: "frontend",
    difficulty: "staff-phd",
    prompt: `A page is tall.

Most sections sleep
below the fold,
yet layout still pays
for all of them.

What CSS hint
lets the browser skip
what no one sees?`,
    answers: ["content-visibility", "content-visibility: auto", "CSS content visibility"],
    explanation: "`content-visibility: auto` lets the browser skip rendering work for offscreen content until needed."
  },
  {
    id: "backend-staff-phd-001",
    area: "backend",
    difficulty: "staff-phd",
    prompt: `The consumer writes
to the database.

Then it crashes
before saving the offset.

The event returns,
same as before.

What pattern remembers
which message already
left a mark?`,
    answers: ["inbox pattern", "idempotent consumer", "consumer inbox", "processed message table"],
    explanation: "The inbox pattern or an idempotent consumer records processed messages so redelivery does not repeat effects."
  },
  {
    id: "backend-staff-phd-002",
    area: "backend",
    difficulty: "staff-phd",
    prompt: `One tenant sends
the holiday flood.

Shared workers fill.
Quiet tenants wait
behind someone else's sale.

What guard gives
each tenant
its own ceiling?`,
    answers: ["tenant quotas", "per-tenant rate limiting", "tenant rate limits", "fair queuing"],
    explanation: "Per-tenant quotas, limits, or fair queues prevent one tenant from consuming shared capacity."
  },
  {
    id: "backend-staff-phd-003",
    area: "backend",
    difficulty: "staff-phd",
    prompt: `The API says accepted.

The job sits only
in memory.

The pod dies.
The promise disappears.

What kind of queue
should have held
the work?`,
    answers: ["durable queue", "persistent queue", "durable job queue", "message queue with durability"],
    explanation: "Accepted asynchronous work should be written to durable storage before the API promises it will happen."
  },
  {
    id: "databases-staff-phd-001",
    area: "databases",
    difficulty: "staff-phd",
    prompt: `Two doctors are on call.

Each transaction sees
the other still working.

Both go off duty.
The rule is broken,
though no row was dirty.

What anomaly slipped through?`,
    answers: ["write skew", "write-skew anomaly", "serialization anomaly"],
    explanation: "Write skew can occur under snapshot isolation when concurrent transactions make compatible row updates that violate a shared invariant."
  },
  {
    id: "databases-staff-phd-002",
    area: "databases",
    difficulty: "staff-phd",
    prompt: `A new index
would save the query.

The deploy creates it
the simple way.

Writes freeze
on the busiest table.

What safer build
did production need?`,
    answers: ["concurrent index", "CREATE INDEX CONCURRENTLY", "online index build", "online schema change"],
    explanation: "Concurrent or online index creation avoids long write-blocking locks on production tables."
  },
  {
    id: "databases-staff-phd-003",
    area: "databases",
    difficulty: "staff-phd",
    prompt: `Rows are deleted.

The table does not shrink.
Old versions pile up
behind a long transaction.

Queries slow
through invisible dust.

What cleanup
fell behind?`,
    answers: ["vacuum", "autovacuum", "MVCC bloat", "table bloat"],
    explanation: "In MVCC databases, old row versions can create bloat when vacuum or cleanup cannot keep up."
  },
  {
    id: "infra-devops-staff-phd-001",
    area: "infra-devops",
    difficulty: "staff-phd",
    prompt: `Packets vanish
between two pods.

Logs say nothing.
Metrics shrug.

You need to watch
the kernel path
without changing the app.

What lens can trace it?`,
    answers: ["eBPF", "extended BPF", "BPF tracing", "kernel tracing"],
    explanation: "eBPF can observe kernel-level networking and system behavior without changing application code."
  },
  {
    id: "infra-devops-staff-phd-002",
    area: "infra-devops",
    difficulty: "staff-phd",
    prompt: `The control plane
goes quiet.

Existing traffic flows.
New deploys freeze.

The cluster is alive,
but cannot be steered.

Which plane
did you lose?`,
    answers: ["control plane", "Kubernetes control plane", "k8s control plane", "cluster control plane"],
    explanation: "The control plane schedules and changes cluster state; existing data-plane traffic can keep flowing without it."
  },
  {
    id: "infra-devops-staff-phd-003",
    area: "infra-devops",
    difficulty: "staff-phd",
    prompt: `A YAML file asks
for a public load balancer.

The review is busy.
The cluster obeys.

Policy should have answered
before creation.

What gate was missing?`,
    answers: ["admission control", "admission controller", "OPA Gatekeeper", "policy admission"],
    explanation: "Admission control can enforce infrastructure policy before Kubernetes objects are created."
  },
  {
    id: "security-staff-phd-001",
    area: "security",
    difficulty: "staff-phd",
    prompt: `A token is valid.

The signature checks out.
But the audience is wrong,
and another service
accepts it anyway.

What claim did
the verifier ignore?`,
    answers: ["audience claim", "aud claim", "JWT audience", "token audience"],
    explanation: "JWT verifiers must check the audience claim so tokens minted for one service are not accepted by another."
  },
  {
    id: "security-staff-phd-002",
    area: "security",
    difficulty: "staff-phd",
    prompt: `The server compares
two secret strings.

Wrong guesses fail faster
when the first letters differ.

An attacker listens
to tiny delays.

What kind of leak
opened the door?`,
    answers: ["timing attack", "timing side channel", "side-channel attack", "timing side-channel attack"],
    explanation: "Timing side channels can reveal secret data when comparisons return faster for partial mismatches."
  },
  {
    id: "security-staff-phd-003",
    area: "security",
    difficulty: "staff-phd",
    prompt: `The password is hashed.

The hardware got faster.
Attackers got cheaper.

Your old cost setting
now cracks too quickly.

What parameter
needs to rise
with time?`,
    answers: ["work factor", "cost factor", "password hashing cost", "bcrypt cost"],
    explanation: "Password hashing work factors should be raised over time as hardware improves."
  },
  {
    id: "ai-ml-staff-phd-001",
    area: "ai-ml",
    difficulty: "staff-phd",
    prompt: `The model predicts risk.

Its scores are ordered well,
but ten percent
does not mean
ten out of a hundred.

What missing property
makes the numbers
trustworthy as probabilities?`,
    answers: ["calibration", "model calibration", "probability calibration", "calibrated probabilities"],
    explanation: "A calibrated model's predicted probabilities match observed frequencies."
  },
  {
    id: "ai-ml-staff-phd-002",
    area: "ai-ml",
    difficulty: "staff-phd",
    prompt: `Images gain
invisible dust.

Humans see
the same panda.

The model swears
it is a gibbon.

What kind of example
fooled it?`,
    answers: ["adversarial example", "adversarial input", "adversarial attack", "adversarial perturbation"],
    explanation: "Adversarial examples are carefully perturbed inputs that cause a model to make wrong predictions."
  },
  {
    id: "ai-ml-staff-phd-003",
    area: "ai-ml",
    difficulty: "staff-phd",
    prompt: `The model trains
on hospital data.

One rare patient
left a shape
the model can echo.

Attackers ask questions
and learn who was inside.

What privacy risk
is this?`,
    answers: ["membership inference", "membership inference attack", "training data membership inference"],
    explanation: "Membership inference attacks try to determine whether a specific record was part of a model's training data."
  },
  {
    id: "algorithms-cs-staff-phd-001",
    area: "algorithms-cs",
    difficulty: "staff-phd",
    prompt: `The stream is endless.

You cannot store it.
Still, you need
a decent count
of unique visitors.

What sketch remembers
many names
in little space?`,
    answers: ["HyperLogLog", "HLL", "cardinality sketch"],
    explanation: "HyperLogLog estimates distinct counts using fixed, small memory."
  },
  {
    id: "algorithms-cs-staff-phd-002",
    area: "algorithms-cs",
    difficulty: "staff-phd",
    prompt: `The cache asks
if a key exists.

Most answers can be
probably no.

A false yes is fine.
A false no is not.

What filter
makes that bargain?`,
    answers: ["Bloom filter", "bloom filter"],
    explanation: "A Bloom filter can say an item is definitely absent or probably present, trading space for false positives."
  },
  {
    id: "algorithms-cs-staff-phd-003",
    area: "algorithms-cs",
    difficulty: "staff-phd",
    prompt: `The graph is too large
for one machine.

Each worker knows
its neighbors.

Rounds pass messages
until the answer settles.

What model
organizes the computation?`,
    answers: ["Pregel", "Bulk Synchronous Parallel", "BSP", "vertex-centric computation"],
    explanation: "Pregel-style vertex-centric computation uses bulk synchronous rounds for large distributed graph processing."
  },
  {
    id: "distributed-systems-staff-phd-001",
    area: "distributed-systems",
    difficulty: "staff-phd",
    prompt: `Two replicas accept
two edits offline.

They meet later.
No leader decides.

Both edits survive
without a merge screen.

What data type
was built for this?`,
    answers: ["CRDT", "conflict-free replicated data type", "conflict free replicated data type"],
    explanation: "CRDTs let replicas merge concurrent updates without central coordination."
  },
  {
    id: "distributed-systems-staff-phd-002",
    area: "distributed-systems",
    difficulty: "staff-phd",
    prompt: `Events arrive
from three regions.

Clocks disagree.
Timestamps lie.

You need to know
what happened before
without trusting time.

What clock carries causality?`,
    answers: ["vector clock", "vector clocks", "version vector"],
    explanation: "Vector clocks track causal relationships between events without relying on synchronized wall clocks."
  },
  {
    id: "distributed-systems-staff-phd-003",
    area: "distributed-systems",
    difficulty: "staff-phd",
    prompt: `A read asks
three replicas.

One is stale.
Two agree.

The client trusts
the larger chorus,
not a single voice.

What kind of read
is this?`,
    answers: ["quorum read", "read quorum", "quorum consistency"],
    explanation: "A quorum read consults enough replicas to reduce the chance of returning stale data."
  },
  {
    id: "frontend-college-004",
    area: "frontend",
    difficulty: "college",
    prompt: `You click a link
inside the app.

The whole page reloads.
State disappears.
Music stops.

What kind of navigation
did the app forget?`,
    answers: ["client-side routing", "client side routing", "SPA routing", "single-page app routing"],
    explanation: "Client-side routing lets a single-page app change views without a full page reload."
  },
  {
    id: "frontend-college-005",
    area: "frontend",
    difficulty: "college",
    prompt: `A button looks pretty.

The keyboard finds it,
but no name
comes along.

The screen reader lands
on silence.

What did the control need?`,
    answers: ["accessible name", "aria-label", "label", "button label"],
    explanation: "Interactive controls need an accessible name so assistive technology can describe them."
  },
  {
    id: "frontend-college-006",
    area: "frontend",
    difficulty: "college",
    prompt: `The image is huge.

CSS makes it small.
The phone still downloads
the giant original.

What image feature
offers the browser
better choices?`,
    answers: ["responsive images", "srcset", "picture element", "sizes attribute"],
    explanation: "Responsive image features such as srcset and sizes let browsers choose an appropriate image file."
  },
  {
    id: "backend-college-004",
    area: "backend",
    difficulty: "college",
    prompt: `A request fails.

The client asks:
was it my fault,
or yours?

Which three-digit signal
should answer
before any body text?`,
    answers: ["HTTP status code", "status code", "response status code"],
    explanation: "HTTP status codes communicate broad success or failure categories before clients parse the response body."
  },
  {
    id: "backend-college-005",
    area: "backend",
    difficulty: "college",
    prompt: `The browser sends JSON.

The server replies:
I do not speak
that shape today.

Which header tells
what kind of body
is coming?`,
    answers: ["Content-Type", "content type", "Content-Type header"],
    explanation: "The Content-Type header tells the server or client how to interpret the request or response body."
  },
  {
    id: "backend-college-006",
    area: "backend",
    difficulty: "college",
    prompt: `You need users
to stay logged in.

The server cannot remember
every browser forever.

Which small signed proof
can travel with
each request?`,
    answers: ["JWT", "JSON Web Token", "token", "auth token"],
    explanation: "A signed token such as a JWT can carry authentication claims with each request."
  },
  {
    id: "databases-college-004",
    area: "databases",
    difficulty: "college",
    prompt: `A table stores orders.

Each order points
to one user.

The database should reject
an order for
a user who never existed.

What link enforces that?`,
    answers: ["foreign key", "foreign key constraint", "referential integrity"],
    explanation: "A foreign key constraint enforces that referenced rows exist in another table."
  },
  {
    id: "databases-college-005",
    area: "databases",
    difficulty: "college",
    prompt: `You ask for users
and their orders.

Two tables answer
as one result.

What SQL operation
brings rows together
by a shared key?`,
    answers: ["join", "SQL join", "inner join"],
    explanation: "A join combines rows from related tables using a matching condition."
  },
  {
    id: "databases-college-006",
    area: "databases",
    difficulty: "college",
    prompt: `Your app stores
a user's birthday.

Sorting by text
puts October
before February.

What kind of column
should hold the value?`,
    answers: ["date type", "date column", "DATE", "timestamp", "datetime"],
    explanation: "Date or timestamp column types preserve date semantics for sorting, filtering, and comparison."
  },
  {
    id: "infra-devops-college-004",
    area: "infra-devops",
    difficulty: "college",
    prompt: `The app runs
on your machine.

The server says
command not found.

The runtime lived
only on your laptop.

What file should describe
the image to build?`,
    answers: ["Dockerfile", "docker file"],
    explanation: "A Dockerfile describes the environment and commands needed to build a runnable container image."
  },
  {
    id: "infra-devops-college-005",
    area: "infra-devops",
    difficulty: "college",
    prompt: `The process dies.

Nobody notices
until users complain.

What simple endpoint
could a platform ask:
are you alive?`,
    answers: ["health check", "health endpoint", "liveness check", "liveness probe"],
    explanation: "A health or liveness check lets infrastructure detect and restart unhealthy processes."
  },
  {
    id: "infra-devops-college-006",
    area: "infra-devops",
    difficulty: "college",
    prompt: `You type commands
on production by hand.

Tomorrow,
no one remembers
which flags were used.

What practice keeps
infrastructure written down?`,
    answers: ["infrastructure as code", "IaC", "infra as code"],
    explanation: "Infrastructure as code records infrastructure changes in versioned, reviewable configuration."
  },
  {
    id: "security-college-004",
    area: "security",
    difficulty: "college",
    prompt: `The login form asks:
who are you?

The password answers.
The server believes.

Before permissions,
before roles,
identity comes first.

What step is this?`,
    answers: ["authentication", "authn", "login authentication"],
    explanation: "Authentication verifies who a user is before authorization decides what they may do."
  },
  {
    id: "security-college-005",
    area: "security",
    difficulty: "college",
    prompt: `A password travels
over coffee-shop Wi-Fi.

The page looks normal.
The network listens.

What lock should cover
the trip?`,
    answers: ["HTTPS", "TLS", "SSL", "Transport Layer Security"],
    explanation: "HTTPS uses TLS to encrypt traffic between the browser and server."
  },
  {
    id: "security-college-006",
    area: "security",
    difficulty: "college",
    prompt: `A leaked password hash
meets a rainbow table.

One extra random value
would make old tables
miss their mark.

What should each password
have received?`,
    answers: ["salt", "password salt", "salted hash", "salting"],
    explanation: "A unique salt prevents attackers from reusing precomputed tables across password hashes."
  },
  {
    id: "ai-ml-college-004",
    area: "ai-ml",
    difficulty: "college",
    prompt: `You train on cats
and dogs.

Then ask for
the price of a house.

The answer is not
a class anymore.

What kind of task
predicts a number?`,
    answers: ["regression", "regression task", "supervised regression"],
    explanation: "Regression models predict continuous numeric values rather than class labels."
  },
  {
    id: "ai-ml-college-005",
    area: "ai-ml",
    difficulty: "college",
    prompt: `The model sees
a sentence.

First, words become
numbers it can hold.

What representation
turns tokens into
points in space?`,
    answers: ["embeddings", "word embeddings", "embedding vectors", "vector embeddings"],
    explanation: "Embeddings represent tokens or items as numeric vectors that models can process."
  },
  {
    id: "ai-ml-college-006",
    area: "ai-ml",
    difficulty: "college",
    prompt: `You train a model.

Then hide some examples
until the end.

They act like
a small rehearsal
for the real world.

What set are they?`,
    answers: ["validation set", "validation data", "dev set", "holdout set"],
    explanation: "A validation set estimates performance on unseen data while tuning a model."
  },
  {
    id: "algorithms-cs-college-004",
    area: "algorithms-cs",
    difficulty: "college",
    prompt: `Some classes depend
on other classes.

You cannot take
the advanced one first.

What ordering respects
every prerequisite?`,
    answers: ["topological sort", "topological ordering", "toposort"],
    explanation: "Topological sorting orders dependency graphs so each prerequisite appears before the thing that depends on it."
  },
  {
    id: "algorithms-cs-college-005",
    area: "algorithms-cs",
    difficulty: "college",
    prompt: `A maze branches.

You follow one hallway
all the way down
before trying the next.

What search walks
deep before wide?`,
    answers: ["DFS", "depth-first search", "depth first search"],
    explanation: "Depth-first search explores one path deeply before backtracking to try alternatives."
  },
  {
    id: "algorithms-cs-college-006",
    area: "algorithms-cs",
    difficulty: "college",
    prompt: `Names point
to phone numbers.

You ask by name
and expect the answer
without scanning a list.

What structure
gives that lookup?`,
    answers: ["hash map", "hash table", "dictionary", "map"],
    explanation: "Hash maps provide efficient key-value lookup."
  },
  {
    id: "distributed-systems-college-004",
    area: "distributed-systems",
    difficulty: "college",
    prompt: `One server gets busy.

The next request
goes somewhere else.

Many doors stand
in front of
the same app.

What is sharing
the traffic?`,
    answers: ["load balancer", "load balancing"],
    explanation: "A load balancer distributes traffic across multiple servers."
  },
  {
    id: "distributed-systems-college-005",
    area: "distributed-systems",
    difficulty: "college",
    prompt: `A service calls
another service.

The network coughs.
The call fails once,
then works.

What simple habit
tries again
after a miss?`,
    answers: ["retry", "retries", "retry logic"],
    explanation: "Retry logic repeats transiently failed operations, ideally with limits and backoff."
  },
  {
    id: "distributed-systems-college-006",
    area: "distributed-systems",
    difficulty: "college",
    prompt: `The app writes
to one server.

Copies appear
on others later.

What process spreads
the same data
across machines?`,
    answers: ["replication", "data replication", "database replication"],
    explanation: "Replication copies data across machines for availability, read scaling, or durability."
  },
  {
    id: "frontend-junior-004",
    area: "frontend",
    difficulty: "junior",
    prompt: `The search box
calls the API
on every key.

Fast typing becomes
a tiny denial
of your own service.

What pause should wait
for typing to settle?`,
    answers: ["debounce", "debouncing", "debounced input"],
    explanation: "Debouncing waits for input to pause before running expensive work such as a search request."
  },
  {
    id: "frontend-junior-005",
    area: "frontend",
    difficulty: "junior",
    prompt: `A cleanup is missing.

You leave the page,
but the listener stays.

Each visit adds
one more ghost
hearing the same event.

What did the effect forget?`,
    answers: ["cleanup function", "effect cleanup", "remove event listener", "useEffect cleanup"],
    explanation: "Effects that subscribe to events should clean up subscriptions when components unmount or dependencies change."
  },
  {
    id: "frontend-junior-006",
    area: "frontend",
    difficulty: "junior",
    prompt: `The request finishes
after the user leaves.

The component is gone,
but the response still tries
to set its state.

What should cancel
the late reply?`,
    answers: ["AbortController", "abort controller", "request cancellation", "abort signal"],
    explanation: "AbortController can cancel fetch requests when a component unmounts or a newer request replaces them."
  },
  {
    id: "backend-junior-004",
    area: "backend",
    difficulty: "junior",
    prompt: `The API works
in happy paths.

Then a bad email
reaches the database
and fails loudly.

What gate should reject
bad input sooner?`,
    answers: ["validation", "input validation", "request validation", "schema validation"],
    explanation: "Input validation rejects malformed or invalid requests before deeper system layers handle them."
  },
  {
    id: "backend-junior-005",
    area: "backend",
    difficulty: "junior",
    prompt: `One slow request
waits forever.

The caller hangs.
Workers stay occupied.

What limit says
enough waiting,
fail now?`,
    answers: ["timeout", "request timeout", "deadline"],
    explanation: "Timeouts or deadlines prevent calls from waiting forever and consuming resources."
  },
  {
    id: "backend-junior-006",
    area: "backend",
    difficulty: "junior",
    prompt: `The logs say
something broke.

They do not say
which user,
which request,
or which path.

What extra fields
make logs useful?`,
    answers: ["structured logging", "structured logs", "log context", "contextual logging"],
    explanation: "Structured logs with useful context make production issues easier to search and debug."
  },
  {
    id: "databases-junior-004",
    area: "databases",
    difficulty: "junior",
    prompt: `A query is slow.

You add an index,
but nothing changes.

The filter wraps the column
inside a function.

Why did the index
stay asleep?`,
    answers: ["non-sargable query", "non sargable query", "function on indexed column", "unsargable query"],
    explanation: "Wrapping an indexed column in a function can prevent the database from using the index efficiently."
  },
  {
    id: "databases-junior-005",
    area: "databases",
    difficulty: "junior",
    prompt: `The app inserts
a parent row.

Then children.

The second insert fails,
but the parent remains
alone.

What wrapper should
hold the family together?`,
    answers: ["transaction", "database transaction", "SQL transaction"],
    explanation: "A transaction lets related writes commit or roll back together."
  },
  {
    id: "databases-junior-006",
    area: "databases",
    difficulty: "junior",
    prompt: `Users search by email.

Some emails are uppercase.
Some are not.

The app treats them equal.
The database does not.

What normalization
should happen before storage?`,
    answers: ["lowercasing", "case normalization", "normalize email", "email normalization"],
    explanation: "Normalizing values such as email case before storage makes equality checks predictable."
  },
  {
    id: "infra-devops-junior-004",
    area: "infra-devops",
    difficulty: "junior",
    prompt: `The container starts.

It exits immediately.
Kubernetes starts it again.

Again.
Again.

What loop
is the pod trapped in?`,
    answers: ["CrashLoopBackOff", "crash loop", "pod crash loop", "crashloopbackoff"],
    explanation: "CrashLoopBackOff means a container keeps crashing and Kubernetes keeps trying to restart it."
  },
  {
    id: "infra-devops-junior-005",
    area: "infra-devops",
    difficulty: "junior",
    prompt: `The pod can start
without config.

It should not.

A missing password
becomes a runtime mystery.

What startup check
should fail fast?`,
    answers: ["configuration validation", "startup validation", "env validation", "config validation"],
    explanation: "Startup configuration validation fails early when required settings or secrets are missing."
  },
  {
    id: "infra-devops-junior-006",
    area: "infra-devops",
    difficulty: "junior",
    prompt: `Disk fills slowly.

The app is fine
until logs eat
the whole machine.

What log practice
keeps files
from growing forever?`,
    answers: ["log rotation", "rotate logs", "log retention"],
    explanation: "Log rotation and retention prevent log files from consuming unbounded disk space."
  },
  {
    id: "security-junior-004",
    area: "security",
    difficulty: "junior",
    prompt: `The reset link works.

It still works
tomorrow.

Anyone who finds it
can open the account.

What should the link
have had?`,
    answers: ["expiration", "expiry", "token expiration", "short-lived token"],
    explanation: "Password reset tokens should be short-lived so old links cannot be abused later."
  },
  {
    id: "security-junior-005",
    area: "security",
    difficulty: "junior",
    prompt: `The login error says:
no account with that email.

Another says:
wrong password.

An attacker learns
which addresses live here.

What leak is this?`,
    answers: ["user enumeration", "account enumeration", "username enumeration"],
    explanation: "User enumeration happens when responses reveal whether an account exists."
  },
  {
    id: "security-junior-006",
    area: "security",
    difficulty: "junior",
    prompt: `The API accepts
any website's browser.

Cookies ride along.
Origins are never checked.

What browser header
should the server inspect?`,
    answers: ["Origin header", "origin", "Referer header", "referer"],
    explanation: "Origin or Referer checks help defend state-changing browser requests from cross-site abuse."
  },
  {
    id: "ai-ml-junior-004",
    area: "ai-ml",
    difficulty: "junior",
    prompt: `A notebook works.

Production fails
on one missing column.

Training data had it.
Live data does not.

What contract should guard
the model's inputs?`,
    answers: ["feature schema", "input schema", "schema validation", "feature contract"],
    explanation: "Feature schema validation catches missing or malformed model inputs before prediction."
  },
  {
    id: "ai-ml-junior-005",
    area: "ai-ml",
    difficulty: "junior",
    prompt: `The model returns
one class.

Support asks:
how sure was it?

What score should travel
beside the label?`,
    answers: ["confidence score", "prediction probability", "probability", "class probability"],
    explanation: "Prediction probabilities or confidence scores expose how strongly a model favored a class."
  },
  {
    id: "ai-ml-junior-006",
    area: "ai-ml",
    difficulty: "junior",
    prompt: `The training run
was great.

Next week,
nobody can recreate it.

The data changed,
the code changed,
the parameters vanished.

What should have been tracked?`,
    answers: ["experiment tracking", "ML experiment tracking", "model experiment tracking"],
    explanation: "Experiment tracking records code, data, parameters, and metrics so ML runs can be reproduced."
  },
  {
    id: "algorithms-cs-junior-004",
    area: "algorithms-cs",
    difficulty: "junior",
    prompt: `A loop scans
the same array
inside another loop.

Then a set appears,
and lookups stop walking.

What trade changed
time into memory?`,
    answers: ["space-time tradeoff", "time-space tradeoff", "space time tradeoff"],
    explanation: "Using extra memory such as a set can reduce repeated scanning and improve runtime."
  },
  {
    id: "algorithms-cs-junior-005",
    area: "algorithms-cs",
    difficulty: "junior",
    prompt: `The array is sorted.

One pointer starts left.
One starts right.

Together they close in
on a target sum.

What technique
are you using?`,
    answers: ["two pointers", "two-pointer technique", "two pointer technique"],
    explanation: "The two-pointer technique uses two indices moving through sorted or structured data to find matches efficiently."
  },
  {
    id: "algorithms-cs-junior-006",
    area: "algorithms-cs",
    difficulty: "junior",
    prompt: `A window grows
while the sum is small.

It shrinks
when the sum is too big.

What technique
keeps a moving slice?`,
    answers: ["sliding window", "sliding-window technique"],
    explanation: "Sliding window techniques maintain a moving range over data to avoid recomputing each slice."
  },
  {
    id: "distributed-systems-junior-004",
    area: "distributed-systems",
    difficulty: "junior",
    prompt: `The queue receives
a message.

The worker crashes
before saying done.

Later,
the same message
returns.

What delivery promise
did the queue make?`,
    answers: ["at-least-once delivery", "at least once", "at-least-once"],
    explanation: "At-least-once delivery may redeliver messages until they are acknowledged."
  },
  {
    id: "distributed-systems-junior-005",
    area: "distributed-systems",
    difficulty: "junior",
    prompt: `A service wants
another service's address.

No one wants
to hardcode hostnames.

What system tells
who is alive
and where?`,
    answers: ["service discovery", "service registry", "discovery service"],
    explanation: "Service discovery lets services find healthy instances without hardcoded addresses."
  },
  {
    id: "distributed-systems-junior-006",
    area: "distributed-systems",
    difficulty: "junior",
    prompt: `One instance dies.

The load balancer
keeps sending traffic
until someone notices.

What signal should remove
the sick instance?`,
    answers: ["health check", "instance health check", "load balancer health check"],
    explanation: "Load balancer health checks remove unhealthy instances from rotation."
  },
  {
    id: "frontend-intermediate-004",
    area: "frontend",
    difficulty: "intermediate",
    prompt: `The tab stays open
all afternoon.

Memory climbs
after every visit
to the same screen.

Nothing is visible,
but old objects
still hold hands.

What kind of bug
is growing?`,
    answers: ["memory leak", "frontend memory leak", "JavaScript memory leak"],
    explanation: "A memory leak happens when unused objects remain reachable and cannot be garbage collected."
  },
  {
    id: "frontend-intermediate-005",
    area: "frontend",
    difficulty: "intermediate",
    prompt: `You type cat.
Then cats.

The cats request
returns first.

The older cat reply
arrives late
and overwrites the page.

What bug won
the race?`,
    answers: ["stale response", "request race", "race condition", "out-of-order response"],
    explanation: "Out-of-order async responses can make older requests overwrite newer UI state."
  },
  {
    id: "frontend-intermediate-006",
    area: "frontend",
    difficulty: "intermediate",
    prompt: `You click like.

The heart fills
before the server answers.

Then the server says no,
and the heart must
learn regret.

What UI pattern
needs a rollback?`,
    answers: ["optimistic update", "optimistic UI", "optimistic rendering"],
    explanation: "Optimistic UI updates immediately and rolls back if the server rejects the change."
  },
  {
    id: "backend-intermediate-004",
    area: "backend",
    difficulty: "intermediate",
    prompt: `The service is healthy
after deploy.

Hours later,
new requests wait
for a database handle.

Some paths borrowed one
and never gave it back.

What leak
emptied the pool?`,
    answers: ["connection leak", "database connection leak", "connection pool leak"],
    explanation: "A connection leak happens when code fails to return borrowed connections to the pool."
  },
  {
    id: "backend-intermediate-005",
    area: "backend",
    difficulty: "intermediate",
    prompt: `Provider says
the response is compatible.

Consumer deploys
and breaks anyway.

Nobody tested
the shape the client
actually depends on.

What test was missing?`,
    answers: ["consumer-driven contract test", "contract test", "consumer contract test", "Pact test"],
    explanation: "Consumer-driven contract tests verify that providers keep the response shapes consumers actually rely on."
  },
  {
    id: "backend-intermediate-006",
    area: "backend",
    difficulty: "intermediate",
    prompt: `One bad job
keeps failing.

The worker retries it,
then retries it again.

Good jobs wait
behind the cursed one.

Where should the bad job
be moved?`,
    answers: ["dead-letter queue", "DLQ", "dead letter queue"],
    explanation: "A dead-letter queue isolates messages that repeatedly fail so they do not block healthy work."
  },
  {
    id: "databases-intermediate-004",
    area: "databases",
    difficulty: "intermediate",
    prompt: `The query needs
three columns.

The index already holds
all three.

The table itself
does not need
to be touched.

What kind of index
made that possible?`,
    answers: ["covering index", "index-only scan", "covering indexes"],
    explanation: "A covering index contains all columns needed by a query, allowing an index-only scan."
  },
  {
    id: "databases-intermediate-005",
    area: "databases",
    difficulty: "intermediate",
    prompt: `Two transactions read
the same quiet room.

One inserts.
The other inserts.

Together they break
a rule neither saw.

What setting decides
which worlds they may see?`,
    answers: ["isolation level", "transaction isolation", "database isolation level"],
    explanation: "Transaction isolation levels control what concurrent transactions can see and which anomalies are possible."
  },
  {
    id: "databases-intermediate-006",
    area: "databases",
    difficulty: "intermediate",
    prompt: `The report is slow
because the same joins
run every morning.

You store the answer,
then refresh it
when the source changes.

What saved result
are you using?`,
    answers: ["materialized view", "materialized query", "precomputed view"],
    explanation: "A materialized view stores a query result so expensive work does not need to run every time."
  },
  {
    id: "infra-devops-intermediate-004",
    area: "infra-devops",
    difficulty: "intermediate",
    prompt: `Green waits ready.

Blue still serves users.

One switch moves traffic,
and rollback is
another switch away.

What deployment style
is this?`,
    answers: ["blue-green deployment", "blue green deployment", "blue/green deployment", "blue-green deploy", "blue green deploy"],
    explanation: "Blue-green deployment keeps two environments so traffic can move quickly between old and new versions."
  },
  {
    id: "infra-devops-intermediate-005",
    area: "infra-devops",
    difficulty: "intermediate",
    prompt: `The pod is scheduled
onto a tiny node.

It asks politely
for little memory,
then eats much more.

What pair of settings
should describe
need and ceiling?`,
    answers: ["requests and limits", "resource requests and limits", "Kubernetes requests and limits", "k8s requests and limits"],
    explanation: "Kubernetes requests guide scheduling, while limits cap resource usage."
  },
  {
    id: "infra-devops-intermediate-006",
    area: "infra-devops",
    difficulty: "intermediate",
    prompt: `Traffic rises.

Pods multiply
without a human
typing deploy.

A metric crosses a line,
and the fleet grows.

What controller
is watching?`,
    answers: ["Horizontal Pod Autoscaler", "HPA", "Kubernetes HPA", "k8s HPA"],
    explanation: "The Horizontal Pod Autoscaler adjusts pod count based on metrics such as CPU or custom load."
  },
  {
    id: "security-intermediate-004",
    area: "security",
    difficulty: "intermediate",
    prompt: `A secret leaked
last month.

The app still trusts it
today.

No one changed the key.

What practice should make
old secrets expire?`,
    answers: ["secret rotation", "key rotation", "credential rotation"],
    explanation: "Secret rotation replaces credentials regularly or after exposure so old secrets stop working."
  },
  {
    id: "security-intermediate-005",
    area: "security",
    difficulty: "intermediate",
    prompt: `A script slips
onto the page.

The browser asks:
is this source allowed
to run here?

What policy answers
before the script runs?`,
    answers: ["Content Security Policy", "CSP", "content-security-policy"],
    explanation: "Content Security Policy restricts which scripts and other resources a browser may load or execute."
  },
  {
    id: "security-intermediate-006",
    area: "security",
    difficulty: "intermediate",
    prompt: `A refresh token
is stolen.

The real user
keeps using theirs.

Two branches appear
from one token family.

What defense spots
the reuse?`,
    answers: ["refresh token rotation", "token rotation", "refresh token reuse detection"],
    explanation: "Refresh token rotation can detect reuse when an old refresh token is presented after it has been replaced."
  },
  {
    id: "ai-ml-intermediate-004",
    area: "ai-ml",
    difficulty: "intermediate",
    prompt: `Training uses
beautiful labels.

Production receives
labels from humans
in a hurry.

The target itself
starts to wobble.

What problem entered
the data?`,
    answers: ["label noise", "noisy labels", "labeling noise"],
    explanation: "Label noise means training labels are incorrect or inconsistent, which can limit model quality."
  },
  {
    id: "ai-ml-intermediate-005",
    area: "ai-ml",
    difficulty: "intermediate",
    prompt: `A model flags disease.

Doctors ask:
of all real cases,
how many did
we catch?

Which metric answers
that question?`,
    answers: ["recall", "sensitivity", "true positive rate"],
    explanation: "Recall measures the share of actual positive cases that the model correctly catches."
  },
  {
    id: "ai-ml-intermediate-006",
    area: "ai-ml",
    difficulty: "intermediate",
    prompt: `Training and serving
both need the same feature.

Teams keep rewriting it
in notebooks,
jobs,
and APIs.

What shared store
keeps one definition?`,
    answers: ["feature store", "ML feature store"],
    explanation: "A feature store centralizes feature definitions so training and serving can reuse the same logic."
  },
  {
    id: "algorithms-cs-intermediate-004",
    area: "algorithms-cs",
    difficulty: "intermediate",
    prompt: `Users become groups.

Friendships merge groups.

You keep asking
whether two users
already share a root.

What structure answers
merge and find?`,
    answers: ["union-find", "disjoint set", "DSU", "disjoint-set union"],
    explanation: "Union-find tracks disjoint sets with efficient union and find operations."
  },
  {
    id: "algorithms-cs-intermediate-005",
    area: "algorithms-cs",
    difficulty: "intermediate",
    prompt: `Cache nodes change.

You do not want
every key to move
when one node leaves.

What hashing trick
keeps most keys home?`,
    answers: ["consistent hashing", "consistent hash"],
    explanation: "Consistent hashing minimizes key movement when nodes are added or removed."
  },
  {
    id: "algorithms-cs-intermediate-006",
    area: "algorithms-cs",
    difficulty: "intermediate",
    prompt: `A puzzle tries
one choice,
then another.

Wrong paths unwind.
The search returns
to the last fork.

What technique
walks by undoing?`,
    answers: ["backtracking", "backtracking search"],
    explanation: "Backtracking explores choices and undoes them when a path cannot lead to a solution."
  },
  {
    id: "distributed-systems-intermediate-004",
    area: "distributed-systems",
    difficulty: "intermediate",
    prompt: `The leader dies.

Followers wait,
then one steps forward.

The cluster needs
a single voice again.

What process chooses it?`,
    answers: ["leader election", "leader election algorithm", "election"],
    explanation: "Leader election lets distributed nodes choose a coordinator after failure or startup."
  },
  {
    id: "distributed-systems-intermediate-005",
    area: "distributed-systems",
    difficulty: "intermediate",
    prompt: `The message is sent.

The sender waits
for a promise
that someone received it.

Without that promise,
the message may return.

What signal is missing?`,
    answers: ["acknowledgement", "ack", "message acknowledgement", "message ack"],
    explanation: "Message acknowledgements tell a broker that a consumer has successfully handled a message."
  },
  {
    id: "distributed-systems-intermediate-006",
    area: "distributed-systems",
    difficulty: "intermediate",
    prompt: `Two machines disagree
about now.

One token expires early.
Another lives too long.

The clocks are close,
but not close enough.

What drift caused
the strange truth?`,
    answers: ["clock skew", "time skew", "clock drift"],
    explanation: "Clock skew between machines can break time-based logic such as expiry, ordering, and leases."
  },
  {
    id: "llm-agents-college-001",
    area: "llm-agents",
    difficulty: "college",
    prompt: `You ask the model
for yesterday's build log.

It answers confidently
with a log
that never existed.

What failure did
the model invent?`,
    answers: ["hallucination", "LLM hallucination", "model hallucination"],
    explanation: "A hallucination is when a model produces unsupported or fabricated information."
  },
  {
    id: "llm-agents-college-002",
    area: "llm-agents",
    difficulty: "college",
    prompt: `The model reads
your whole request
inside a fixed window.

Old messages fall out
when the chat grows long.

What limit did
you run into?`,
    answers: ["context window", "context length", "token window", "context limit"],
    explanation: "The context window is the amount of text a model can consider at once."
  },
  {
    id: "llm-agents-college-003",
    area: "llm-agents",
    difficulty: "college",
    prompt: `A sentence enters.

Before the model
can hold it,
the sentence breaks
into small numbered pieces.

What are those pieces?`,
    answers: ["tokens", "token", "LLM tokens"],
    explanation: "LLMs process text as tokens, which are chunks of characters or words mapped to numbers."
  },
  {
    id: "llm-agents-college-004",
    area: "llm-agents",
    difficulty: "college",
    prompt: `You ask the model
to write SQL.

It should not run
the database itself.

Instead it returns
a structured request
for another system.

What is the model making?`,
    answers: ["tool call", "function call", "function calling", "tool invocation"],
    explanation: "A tool call is a structured request from a model to run external code or services."
  },
  {
    id: "llm-agents-college-005",
    area: "llm-agents",
    difficulty: "college",
    prompt: `The model writes
a final answer.

But first,
you give it rules,
examples,
and the shape
you want back.

What instruction bundle
did you craft?`,
    answers: ["prompt", "LLM prompt", "prompting"],
    explanation: "A prompt is the instruction and context given to a model to guide its response."
  },
  {
    id: "llm-agents-college-006",
    area: "llm-agents",
    difficulty: "college",
    prompt: `The model alone
knows only what
fits in its weights.

You fetch docs first,
then ask with evidence
on the table.

What pattern is this?`,
    answers: ["RAG", "retrieval augmented generation", "retrieval-augmented generation"],
    explanation: "Retrieval-augmented generation fetches relevant documents and includes them as context for the model."
  },
  {
    id: "llm-agents-junior-001",
    area: "llm-agents",
    difficulty: "junior",
    prompt: `The agent wants
to delete a file.

The UI pauses
and asks the human
before the command runs.

What safety gate
is this?`,
    answers: ["human approval", "approval gate", "human-in-the-loop approval", "permission prompt"],
    explanation: "Human approval gates stop risky agent actions until a person confirms them."
  },
  {
    id: "llm-agents-junior-002",
    area: "llm-agents",
    difficulty: "junior",
    prompt: `The model calls
a weather tool.

The tool returns JSON.
The model reads it
and answers the user.

What loop connects
thinking to action
and back?`,
    answers: ["tool loop", "agent loop", "tool-use loop", "reason-act loop"],
    explanation: "An agent or tool loop lets a model choose an action, observe the result, and continue."
  },
  {
    id: "llm-agents-junior-003",
    area: "llm-agents",
    difficulty: "junior",
    prompt: `The output must be
valid JSON.

The model keeps adding
friendly words
around the object.

What constraint should force
the shape?`,
    answers: ["structured output", "JSON mode", "schema-constrained output", "response schema"],
    explanation: "Structured output constrains a model response to a schema or machine-readable format."
  },
  {
    id: "llm-agents-junior-004",
    area: "llm-agents",
    difficulty: "junior",
    prompt: `You paste a huge file
into chat.

The model forgets
the first half
before answering
the last question.

What budget did
you overflow?`,
    answers: ["token budget", "context budget", "token limit", "context limit"],
    explanation: "A token or context budget limits how much text can fit into a model request."
  },
  {
    id: "llm-agents-junior-005",
    area: "llm-agents",
    difficulty: "junior",
    prompt: `The agent edits code.

Then tests fail.
It reads the failure,
changes the patch,
and runs them again.

What development loop
is it following?`,
    answers: ["red-green-refactor", "TDD loop", "test-driven development loop", "test feedback loop"],
    explanation: "Agentic coding often uses test feedback loops such as red-green-refactor to guide changes."
  },
  {
    id: "llm-agents-junior-006",
    area: "llm-agents",
    difficulty: "junior",
    prompt: `A tool accepts
one city name.

The model sends
city, country,
and a paragraph.

The call fails
before reaching the API.

What contract did
the model violate?`,
    answers: ["tool schema", "function schema", "JSON schema", "argument schema"],
    explanation: "Tool schemas define the arguments a model must provide when calling external tools."
  },
  {
    id: "llm-agents-intermediate-001",
    area: "llm-agents",
    difficulty: "intermediate",
    prompt: `The user says:
ignore all previous rules.

The model sees it
inside a support ticket
and obeys the ticket
instead of the system.

What attack slipped
through the text?`,
    answers: ["prompt injection", "indirect prompt injection", "prompt-injection attack"],
    explanation: "Prompt injection tries to override trusted instructions through user or retrieved content."
  },
  {
    id: "llm-agents-intermediate-002",
    area: "llm-agents",
    difficulty: "intermediate",
    prompt: `The agent reads docs.

A poisoned page says:
send the secret
to this URL.

The page was data.
The agent treated it
like orders.

What boundary failed?`,
    answers: ["instruction-data separation", "instruction data separation", "data-instruction boundary", "prompt injection boundary"],
    explanation: "Agents need to separate untrusted retrieved data from trusted instructions."
  },
  {
    id: "llm-agents-intermediate-003",
    area: "llm-agents",
    difficulty: "intermediate",
    prompt: `The agent can search,
edit,
and run commands.

One bad plan
touches the real repo.

What isolated place
should have caught
the mistake first?`,
    answers: ["sandbox", "sandbox environment", "isolated sandbox", "test sandbox"],
    explanation: "A sandbox lets agents try risky actions away from production or the real working tree."
  },
  {
    id: "llm-agents-intermediate-004",
    area: "llm-agents",
    difficulty: "intermediate",
    prompt: `The agent keeps trying.

Each failure creates
another tool call.

The bill rises,
and the task
never ends.

What limit should stop
the loop?`,
    answers: ["iteration limit", "step limit", "tool call limit", "agent step limit"],
    explanation: "Agent loops need step, iteration, or tool-call limits to prevent runaway execution."
  },
  {
    id: "llm-agents-intermediate-005",
    area: "llm-agents",
    difficulty: "intermediate",
    prompt: `The model sounds right.

The test suite says no.
The benchmark says no.
The human review says no.

What system judges
the agent's work
after it speaks?`,
    answers: ["evaluation harness", "eval harness", "evals", "evaluation suite"],
    explanation: "An evaluation harness runs tests or checks to judge model or agent outputs consistently."
  },
  {
    id: "llm-agents-intermediate-006",
    area: "llm-agents",
    difficulty: "intermediate",
    prompt: `One agent needs files.
Another needs issues.
Another needs a database.

Each server offers tools
through the same kind
of doorway.

What protocol
is that doorway?`,
    answers: ["MCP", "Model Context Protocol", "model context protocol"],
    explanation: "MCP is a protocol for connecting models and agents to external tools and context providers."
  },
  {
    id: "llm-agents-senior-001",
    area: "llm-agents",
    difficulty: "senior",
    prompt: `The agent can deploy.

It can also read secrets.
One prompt injection
turns a docs page
into a command.

What design should split
what it may read
from what it may do?`,
    answers: ["capability isolation", "tool permission boundaries", "permission separation", "least privilege"],
    explanation: "Agent tools should use isolated capabilities and permission boundaries to limit blast radius."
  },
  {
    id: "llm-agents-senior-002",
    area: "llm-agents",
    difficulty: "senior",
    prompt: `The agent fixes
ten easy bugs.

On the eleventh,
it edits the wrong layer
but explains it beautifully.

What evidence should decide
whether the fix is real?`,
    answers: ["verification", "test verification", "grounded verification", "automated verification"],
    explanation: "Agentic systems need verification through tests, checks, or grounded evidence rather than persuasive explanations."
  },
  {
    id: "llm-agents-senior-003",
    area: "llm-agents",
    difficulty: "senior",
    prompt: `The demo agent works.

Then real users arrive
with long tasks,
partial failures,
and strange files.

Success depends less
on the model
than on the rails
around it.

What are you building?`,
    answers: ["agent harness", "agentic harness", "AI agent harness", "harness"],
    explanation: "An agent harness provides the scaffolding around a model: tools, limits, state, prompts, permissions, and feedback."
  },
  {
    id: "llm-agents-staff-phd-001",
    area: "llm-agents",
    difficulty: "staff-phd",
    prompt: `The agent is evaluated
on old tasks.

The model saw
some of them
during training.

Scores rise,
but the benchmark
is no longer clean.

What contamination
spoiled the test?`,
    answers: ["benchmark contamination", "data contamination", "test contamination", "eval contamination"],
    explanation: "Benchmark contamination happens when evaluation tasks appear in training data or tuning data."
  },
  {
    id: "llm-agents-staff-phd-002",
    area: "llm-agents",
    difficulty: "staff-phd",
    prompt: `A tool result says:
all tests passed.

The agent believes it.
But the tool output
was forged by text
inside the repo.

What channel should be
trusted separately
from model-readable text?`,
    answers: ["trusted tool result", "trusted execution channel", "authenticated tool output", "out-of-band tool result"],
    explanation: "Agent systems need trusted execution channels so untrusted text cannot spoof tool results."
  },
  {
    id: "llm-agents-staff-phd-003",
    area: "llm-agents",
    difficulty: "staff-phd",
    prompt: `The agent improves
when it writes notes
for the next run.

Then one bad note
poisons every future task.

Memory became state,
and state became risk.

What system needs
curation and expiry?`,
    answers: ["agent memory", "long-term memory", "persistent agent memory", "memory store"],
    explanation: "Persistent agent memory needs curation, expiry, and trust controls because bad memories can affect future behavior."
  },
];
