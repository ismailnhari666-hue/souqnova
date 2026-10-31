const API="https://mowarid.ma/api/v1";
const ORIGIN="https://ismailnhari666-hue.github.io";
const STORE="https://ismailnhari666-hue.github.io/souqnova/";

const C={
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type",
  "Vary":"Origin"
};

const out=(x,s=200)=>new Response(JSON.stringify(x),{
  status:s,
  headers:{...C,"Content-Type":"application/json; charset=utf-8"}
});

const phoneOK=p=>/^(05|06|07)\d{8}$/.test(String(p||""));

export default {
  async fetch(req,env){
    const origin=req.headers.get("Origin");

    if(origin&&origin!==ORIGIN)
      return new Response("Forbidden",{status:403});

    if(req.method==="OPTIONS")
      return new Response(null,{headers:C});

    const u=new URL(req.url);
    const path=u.pathname;

    try{
      if(path==="/api/cities"&&req.method==="GET"){
        const r=await fetch(API+"/cities"+u.search);
        return new Response(await r.text(),{
          status:r.status,
          headers:{...C,"Content-Type":"application/json"}
        });
      }

      if(!env.MOWARID_API_KEY)
        return out({success:false,error:"API key not configured"},500);

      const auth={
        Authorization:`Bearer ${env.MOWARID_API_KEY}`,
        Accept:"application/json"
      };

      if(path==="/api/products"&&req.method==="GET"){
        const r=await fetch(API+"/products"+u.search,{headers:auth});
        return new Response(await r.text(),{
          status:r.status,
          headers:{...C,"Content-Type":"application/json"}
        });
      }

      if(path==="/api/quote"&&req.method==="POST"){
        const body=await req.text();
        const r=await fetch(API+"/orders/quote",{
          method:"POST",
          headers:{...auth,"Content-Type":"application/json"},
          body
        });
        return new Response(await r.text(),{
          status:r.status,
          headers:{...C,"Content-Type":"application/json"}
        });
      }

      if(path==="/api/orders"&&req.method==="POST"){
        let b;
        try{
          b=await req.json();
        }catch{
          return out({success:false,error:"Invalid JSON"},400);
        }

        const items=Array.isArray(b.items)?b.items:[{
          product_code:b.product_code,
          quantity:b.quantity,
          retail_price:b.retail_price
        }];

        if(!b.external_order_id||String(b.external_order_id).length>100)
          return out({success:false,error:"external_order_id required"},400);

        if(!b.customer_name||!phoneOK(b.customer_phone)||!b.city||!b.address)
          return out({success:false,error:"Invalid customer details or Moroccan phone"},400);

        if(!items.length||items.length>50||items.some(i=>
          !i.product_code||
          !Number.isInteger(Number(i.quantity))||
          Number(i.quantity)<1||
          !Number.isFinite(Number(i.retail_price))||
          Number(i.retail_price)<=0
        ))
          return out({success:false,error:"Invalid items"},400);

        const groups=[...new Set(
          items.map(i=>String(i.supplier_group_id||"")).filter(Boolean)
        )];

        if(groups.length>1)
          return out({success:false,error:"mixed_suppliers_not_allowed"},400);

        const fee=Number(b.customer_shipping_fee);

        if(!Number.isFinite(fee)||fee<0)
          return out({success:false,error:"Invalid shipping fee"},400);

        const payload={
          external_order_id:String(b.external_order_id),
          store_name:"SouqNova",
          store_url:STORE,
          customer_name:String(b.customer_name).trim(),
          customer_phone:String(b.customer_phone),
          city:String(b.city).trim(),
          address:String(b.address).trim(),
          customer_shipping_fee:fee,
          notes:String(b.notes||"").slice(0,500),
          items:items.map(i=>({
            product_code:String(i.product_code),
            quantity:Number(i.quantity),
            retail_price:Number(i.retail_price)
          }))
        };

        const r=await fetch(API+"/orders",{
          method:"POST",
          headers:{...auth,"Content-Type":"application/json"},
          body:JSON.stringify(payload)
        });

        return new Response(await r.text(),{
          status:r.status,
          headers:{...C,"Content-Type":"application/json"}
        });
      }

      return out({success:false,error:"Route not found"},404);

    }catch{
      return out({success:false,error:"Server error"},502);
    }
  }
};
