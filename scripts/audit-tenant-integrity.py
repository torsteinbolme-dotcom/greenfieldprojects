"""Disposable authenticated access-control regression. Requires a minted local preview audit session.
Run python3 scripts/audit-tenant-integrity.py; never targets existing projects or changes user records.
"""
import asyncio, json, os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        with open(os.path.expanduser("~/.cache/lovable-auth/session.json")) as file:
            minted = json.load(file)
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [minted["storage_key"], json.dumps(minted["session"])])
        await page.goto("http://localhost:8080/projects")
        await page.get_by_role("button", name="New project", exact=True).wait_for()
        results = await page.evaluate("""async () => {
          const {supabase} = await import('/src/integrations/supabase/client.ts');
          const member = await supabase.from('organization_members').select('organization_id').limit(1).single();
          if (member.error) throw member.error;
          const org = member.data.organization_id;
          const ids = []; const assets = [];
          try {
            for (let i=0;i<2;i++) {
              const p = await supabase.from('projects').insert({organization_id:org,name:'Tenant Audit Temporary '+crypto.randomUUID()}).select().single();
              if (p.error) throw p.error; ids.push(p.data.id);
            }
            const s = await supabase.from('scenarios').insert({organization_id:org,project_id:ids[0],name:'Base',kind:'base'}).select().single();
            if (s.error) throw s.error;
            const demote = await supabase.from('scenarios').update({kind:'custom'}).eq('id',s.data.id);
            const move = await supabase.from('scenarios').update({project_id:ids[1]}).eq('id',s.data.id);
            const remove = await supabase.from('scenarios').delete().eq('id',s.data.id).select('id');
            const foreign = crypto.randomUUID();
            const orgMove = await supabase.from('projects').update({organization_id:foreign}).eq('id',ids[0]);
            const parent = await supabase.from('benchmark_assets').insert({organization_id:org,name:'Tenant Audit Temporary '+crypto.randomUUID(),business_type:'fnb',parent_asset_id:foreign});
            const record = await supabase.from('benchmark_records').insert({organization_id:org,asset_id:foreign,financial_year:2025});
            const version = await supabase.from('scenario_assumptions').insert({organization_id:org,scenario_id:s.data.id,version:1,assumptions:{},calculation_version:'audit'}).select('id').single();
            if (version.error) throw version.error;
            const rewrite = await supabase.from('scenario_assumptions').update({version:9}).eq('id',version.data.id).select('id');
            const erase = await supabase.from('scenario_assumptions').delete().eq('id',version.data.id).select('id');
            const guarded = x => x.error?.code === '23514';
            return {baseKindImmutable:guarded(demote),scenarioProjectImmutable:guarded(move),baseDeleteBlocked:!remove.error&&remove.data.length===0,projectOrgImmutable:guarded(orgMove),foreignBenchmarkParentBlocked:guarded(parent),foreignBenchmarkRecordBlocked:guarded(record),historyUpdateBlocked:!rewrite.error&&rewrite.data.length===0,historyDeleteBlocked:!erase.error&&erase.data.length===0};
          } finally {
            for (const id of ids) { const c=await supabase.from('projects').delete().eq('id',id); if(c.error)throw c.error; }
          }
        }""")
        assert all(results.values()), results
        print("Authenticated tenant/history regression:", results)
        anon = await page.evaluate("""async()=>{
          const {supabase}=await import('/src/integrations/supabase/client.ts');
          await supabase.auth.signOut({scope:'local'});
          const result={};
          for(const t of ['projects','scenarios','scenario_assumptions','latest_scenario_assumptions','benchmark_records','seasonality_profiles']) {
            const q=await supabase.from(t).select('*').limit(1); result[t]=!!q.error || q.data?.length===0;
          }
          return result;
        }""")
        assert all(anon.values()), anon
        print("Anonymous private-data reads blocked:", anon)
        await browser.close()

asyncio.run(main())
