-- Read-only operator check. Does not enable purchases, grant plans or alter caps.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'production_verification_enabled', (SELECT enabled FROM public.apple_production_policy WHERE id),
  'production_sales_enabled', (SELECT sales_enabled FROM public.apple_production_policy WHERE id),
  'review_verification_enabled', (SELECT enabled FROM public.apple_review_policy WHERE id),
  'review_sales_enabled', (SELECT sales_enabled FROM public.apple_review_policy WHERE id),
  'question_policy', (SELECT jsonb_build_object('enabled', enabled,
    'question_limit_micro_usd', question_limit_micro_usd,
    'user_month_limit_micro_usd', user_month_limit_micro_usd,
    'user_day_limit_micro_usd', user_day_limit_micro_usd) FROM public.companion_usage_policy WHERE id),
  'global_ai_budget', (SELECT jsonb_build_object('enabled', enabled,
    'limit_micro_usd', limit_micro_usd, 'committed_micro_usd', committed_micro_usd,
    'halted_reason', halted_reason) FROM public.companion_sol_budget WHERE id='sol-beta')
) AS release_configuration;
ROLLBACK;
