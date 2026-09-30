// ============================================================
//  admin-reset-password Edge Function
//  마스터관리자가 관리자 웹페이지에서 "다른 계정"의 비밀번호를 바꿀 때 호출합니다.
//  다른 사람의 비밀번호를 바꾸는 건 Supabase의 관리자 전용 API(service_role 필요)라서,
//  service_role 키를 브라우저에 절대 내려보내지 않기 위해 이 함수가 대신 실행합니다.
//
//  사용자 브라우저(마스터관리자) → 이 Edge Function(호출자가 master_admin인지 확인) →
//  service_role로 대상 계정 비밀번호 변경
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: '인증 토큰이 없습니다.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) 호출자가 실제로 로그인된 사용자인지 확인
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) {
      return json({ error: '유효하지 않은 로그인입니다. 다시 로그인해주세요.' }, 401);
    }

    // 2) service_role로 호출자의 역할을 확인 (RLS 우회, 서버에서만 실행됨) — 마스터관리자만 허용
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from('user_roles').select('role').eq('user_id', callerData.user.id).maybeSingle();
    if (!callerRole || callerRole.role !== 'master_admin') {
      return json({ error: '마스터관리자만 다른 계정의 비밀번호를 변경할 수 있습니다.' }, 403);
    }

    // 3) 요청 내용 확인
    const body = await req.json();
    const { targetUserId, newPassword } = body || {};
    if (!targetUserId || !newPassword) {
      return json({ error: 'targetUserId, newPassword는 필수입니다.' }, 400);
    }
    if (String(newPassword).length < 8) {
      return json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400);
    }

    // 4) 대상 계정이 마스터관리자 자기 자신인 경우 방지(자기 자신은 일반 로그인 화면에서
    //    본인이 직접 바꾸는 게 안전합니다 — 이 기능은 "다른 계정"을 위한 것입니다)
    if (targetUserId === callerData.user.id) {
      return json({ error: '본인 비밀번호는 이 기능으로 바꿀 수 없습니다.' }, 400);
    }

    // 5) service_role의 관리자 API로 대상 계정 비밀번호 변경
    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });
    if (updateError) {
      return json({ error: '비밀번호 변경 실패: ' + updateError.message }, 500);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
