#!/bin/bash
# usage: scenario.sh base|due|due-spent|exam3|exam21|exam-past
PSQL="/tmp/sb-e2e/pgvenv/lib/python3.12/site-packages/pgserver/pginstall/bin/psql -h 127.0.0.1 -p 5620 -U dev margins -q"
U="(select id from users where email='demo@studymargins.com')"
P="(select id from projects where name='CS 161 Algorithms')"
LA="(now() at time zone 'America/Los_Angeles')::date"

reset() {
  $PSQL <<SQL
update projects set exam_date = null, exam_prompt_dismissed = false, daily_minutes = 45 where id = $P;
delete from quiz_attempts where taken_at > now() - interval '1 day' and user_id = $U;
delete from review_schedules where user_id = $U;
insert into review_schedules (id, user_id, project_id, topic_id, mastery, due_at, interval_days, streak, last_reviewed_at, updated_at)
  select gen_random_uuid(), $U, $P, t.id, 0.125, now() + interval '1 day', 1, 0, now() - interval '1 hour', now() from topics t where t.name = 'Sorting algorithms';
SQL
}

due() {
  $PSQL <<SQL
delete from review_schedules where user_id = $U;
insert into review_schedules (id, user_id, project_id, topic_id, mastery, due_at, interval_days, streak, last_reviewed_at, updated_at)
  select gen_random_uuid(), $U, $P, t.id,
    case t.name when 'Sorting algorithms' then 0.62 when 'Graph traversal' then 0.44 when 'Dynamic programming' then 0.21 when 'Hash tables' then 0.71 else 0.55 end,
    now() - (case t.name when 'Graph traversal' then interval '2 days' when 'Dynamic programming' then interval '5 days' when 'Hash tables' then interval '1 day' when 'Sorting algorithms' then interval '3 hours' else interval '2 days' end),
    case t.name when 'Hash tables' then 7 else 3 end, 1, now() - interval '9 days', now()
  from topics t where t.project_id = $P and t.user_confirmed;
update topic_progress set notes_completed = true, examples_completed = true where user_id = $U;
SQL
}

case "$1" in
  base) reset ;;
  due) reset; due ;;
  due-spent)
    reset; due
    $PSQL <<SQL
update projects set daily_minutes = 10 where id = $P;
insert into quiz_attempts (id, user_id, topic_id, answers, results, score, taken_at)
  select gen_random_uuid(), $U, t.id, '{}'::jsonb, '[]'::jsonb, 60, now() from topics t where t.name = 'Sorting algorithms';
SQL
    ;;
  exam3) reset; due; $PSQL -c "update projects set exam_date = ($LA + 3)::timestamp where id = $P" ;;
  exam21) reset; $PSQL -c "update projects set exam_date = ($LA + 21)::timestamp where id = $P" ;;
  exam-past) reset; due; $PSQL -c "update projects set exam_date = ($LA - 4)::timestamp where id = $P" ;;
  *) echo unknown; exit 2 ;;
esac
echo "scenario $1 ok"
