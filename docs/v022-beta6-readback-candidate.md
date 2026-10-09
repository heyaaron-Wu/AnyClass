# v0.2.2-beta.6 local readback repair candidate

Build: `v022-beta6-20261009-190849`. Database schema: 4 (unchanged).

Parent: immutable beta.5 commit `274ecb44ce3ac5e099a3b188fca149613c736daa`.

Frozen beta.5 reproducibly commits its synthetic legacy snapshot and canonical
course records to a supplied Storage Access factory, then reads the legacy key
from the default factory. With distinct namespaces, this produces the exact
committed-but-unverified warning despite persisted courses. It is a confirmed
application false-negative mechanism, not proof of the precise runtime condition
on the reporting physical device.

This candidate passes the same factory to legacy readback, key counting and both
active-timetable updates. Subsequent previews retain the authorized factory.
Existing verification remains enabled; canonical bundle ownership, term identity,
source fingerprint and model existence are also required before reporting success.
Storage transactions, origin/nonce validation, capture parsers, schema and user
data are not changed.

Permanent regression: `npm run test:postcommit:browser`. Isolated synthetic
namespaces cover standalone Shortcut JSON, actual Bookmark shell/Receiver,
distinct and identical factories, null school/local keys, selected target
isolation, subsequent previews, denied/unsupported access and injected readback
predicate failures. Existing popup persistence coverage exercises reimport and
customized-time preservation. No actual user timetable is imported or changed.

The candidate is local only. No Beta/Production deployment, remote push, PR merge,
Stable promotion, installed Shortcut update, tag or Release is authorized here.
Physical Safari readback confirmation remains pending after separate deployment
authorization. Do not repeat a committed real import merely to retry verification.

Historical ISSUE-031 intermittent failure remains cause unproven; later passing
runs are not an explanation of that historical result.
